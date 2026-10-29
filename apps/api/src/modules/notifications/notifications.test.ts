import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedQueuePolicy,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("notifications", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  // Explicit, strictly increasing `createdAt` timestamps — several
  // notifications created in the same test can otherwise land in the
  // same millisecond, making `ORDER BY createdAt DESC` (and "pick the
  // first row" with no orderBy at all) non-deterministic.
  async function seedNotifications(userId: string, count: number) {
    const base = Date.now();
    for (let i = 0; i < count; i++) {
      await prisma.notification.create({
        data: {
          userId,
          type: "TASK_ASSIGNED",
          title: `Notification ${i}`,
          body: `Body ${i}`,
          createdAt: new Date(base + i * 1000),
        },
      });
    }
  }

  it("lists only the caller's own notifications, newest first, with an unread count", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const other = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedNotifications(lawyer.id, 3);
    await seedNotifications(other.id, 5);
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.unreadCount).toBe(3);
    expect(res.body.meta.total).toBe(3);
    const titles = res.body.data.items.map((n: { title: string }) => n.title);
    expect(titles).toEqual(["Notification 2", "Notification 1", "Notification 0"]);
  });

  it("filters by isRead", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedNotifications(lawyer.id, 2);
    const token = await loginAs(app, lawyer.email);
    const [first] = await prisma.notification.findMany({
      where: { userId: lawyer.id },
      orderBy: { createdAt: "asc" },
    });

    await request(app)
      .post(`/api/v1/notifications/${first!.id}/read`)
      .set("Authorization", `Bearer ${token}`);

    const unreadRes = await request(app)
      .get("/api/v1/notifications")
      .query({ isRead: "false" })
      .set("Authorization", `Bearer ${token}`);

    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.data.items).toHaveLength(1);
    expect(unreadRes.body.data.items[0].id).not.toBe(first!.id);
  });

  it("marks a single notification as read", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedNotifications(lawyer.id, 1);
    const token = await loginAs(app, lawyer.email);
    const [notification] = await prisma.notification.findMany({ where: { userId: lawyer.id } });

    const res = await request(app)
      .post(`/api/v1/notifications/${notification!.id}/read`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
    expect(res.body.data.readAt).not.toBeNull();
  });

  it("returns 404 for a notification belonging to another user (IDOR)", async () => {
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedNotifications(owner.id, 1);
    const attackerToken = await loginAs(app, attacker.email);
    const [notification] = await prisma.notification.findMany({ where: { userId: owner.id } });

    const res = await request(app)
      .post(`/api/v1/notifications/${notification!.id}/read`)
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(res.status).toBe(404);
  });

  it("marks all of the caller's notifications as read, leaving other users' untouched", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const other = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedNotifications(lawyer.id, 3);
    await seedNotifications(other.id, 2);
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updatedCount).toBe(3);

    const stillUnread = await prisma.notification.count({
      where: { userId: lawyer.id, isRead: false },
    });
    expect(stillUnread).toBe(0);
    const otherUnread = await prisma.notification.count({
      where: { userId: other.id, isRead: false },
    });
    expect(otherUnread).toBe(2);
  });
});

describe("notification triggers (spec §5's NotificationType, event-driven half)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("CASE_ASSIGNED: assigning a case notifies the new assignee, but not a self-assignment", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedQueuePolicy(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id });
    const adminToken = await loginAs(app, admin.email);

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ userId: lawyer.id, reason: "test" });

    const notification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "CASE_ASSIGNED", relatedEntityId: caseRow.id },
    });
    expect(notification).not.toBeNull();

    // Self-assignment: no notification to oneself.
    const lawyerToken = await loginAs(app, lawyer.email);
    const caseRow2 = await createTestCase({ createdById: admin.id });
    await request(app)
      .post(`/api/v1/cases/${caseRow2.id}/assign`)
      .set("Authorization", `Bearer ${lawyerToken}`)
      .send({ userId: lawyer.id, reason: "self" });

    const selfNotification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "CASE_ASSIGNED", relatedEntityId: caseRow2.id },
    });
    expect(selfNotification).toBeNull();
  });

  it("TASK_ASSIGNED: creating a task with an assignee notifies them", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedQueuePolicy(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Prepare bail application",
        category: "BAIL_APPLICATION",
        assignedToId: lawyer.id,
        dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      });

    const notification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "TASK_ASSIGNED", relatedEntityId: res.body.data.id },
    });
    expect(notification).not.toBeNull();
  });

  it("DOCUMENT_REQUESTED: marking a document REQUESTED notifies the case's assignee", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedQueuePolicy(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const token = await loginAs(app, admin.email);

    const addRes = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "BAIL_APPLICATION", isMandatory: true });

    await request(app)
      .patch(`/api/v1/documents/${addRes.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "REQUESTED" });

    const notification = await prisma.notification.findFirst({
      where: {
        userId: lawyer.id,
        type: "DOCUMENT_REQUESTED",
        relatedEntityId: addRes.body.data.id,
      },
    });
    expect(notification).not.toBeNull();
  });

  it("urgent action episodes notify the owner once at each stage", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await seedQueuePolicy(admin.id);
    const c = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const token = await loginAs(app, admin.email);
    await prisma.case.update({
      where: { id: c.id },
      data: {
        workflowFacts: {
          urgentReports: [
            {
              id: "r",
              kind: "MEDICAL",
              reportedAt: new Date().toISOString(),
              details: "Synthetic urgent report",
              confidence: "REPORTED",
            },
          ],
        },
      },
    });
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(app)
            .post(`/api/v1/priority/case/${c.id}/recompute`)
            .set("Authorization", `Bearer ${token}`)
        ).status,
      ).toBe(200);
    const notices = await prisma.notification.findMany({
      where: { userId: lawyer.id, type: "PRIORITY_ESCALATED", title: { contains: "U0" } },
    });
    expect(notices).toHaveLength(1);
  });
});
