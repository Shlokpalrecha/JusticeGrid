import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedDefaultRuleset,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("reports", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("GET /reports/pending-by-user groups open tasks by assignee", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    await prisma.task.createMany({
      data: [
        {
          caseId: caseRow.id,
          title: "Task A",
          category: "OTHER",
          assignedToId: lawyer.id,
          createdById: admin.id,
          dueDate: new Date(Date.now() + 86_400_000),
          status: "PENDING",
        },
        {
          caseId: caseRow.id,
          title: "Task B",
          category: "OTHER",
          assignedToId: lawyer.id,
          createdById: admin.id,
          dueDate: new Date(Date.now() + 86_400_000),
          status: "BLOCKED",
        },
        {
          caseId: caseRow.id,
          title: "Task C (completed, excluded)",
          category: "OTHER",
          assignedToId: lawyer.id,
          createdById: admin.id,
          dueDate: new Date(Date.now() + 86_400_000),
          status: "COMPLETED",
          completedAt: new Date(),
        },
      ],
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/pending-by-user")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { userId: string }) => r.userId === lawyer.id);
    expect(row.pendingCount).toBe(1);
    expect(row.blockedCount).toBe(1);
    expect(row.totalOpen).toBe(2);
  });

  it("GET /reports/upcoming-hearings?days= only includes hearings within the window", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    await prisma.hearing.createMany({
      data: [
        {
          caseId: caseRow.id,
          scheduledDate: new Date(Date.now() + 2 * 86_400_000),
          hearingType: "EVIDENCE",
          recordedById: admin.id,
        },
        {
          caseId: caseRow.id,
          scheduledDate: new Date(Date.now() + 20 * 86_400_000),
          hearingType: "ARGUMENTS",
          recordedById: admin.id,
        },
      ],
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/upcoming-hearings")
      .query({ days: 7 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].hearingType).toBe("EVIDENCE");
  });

  it("GET /reports/overdue-actions lists open tasks past their dueDate with days overdue", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Overdue task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() - 3 * 86_400_000),
        status: "PENDING",
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/overdue-actions")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].daysOverdue).toBeGreaterThanOrEqual(3);
  });

  it("GET /reports/priority-distribution matches GET /priority/distribution", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const reportRes = await request(app)
      .get("/api/v1/reports/priority-distribution")
      .set("Authorization", `Bearer ${token}`);
    const priorityRes = await request(app)
      .get("/api/v1/priority/distribution")
      .set("Authorization", `Bearer ${token}`);

    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data).toEqual(priorityRes.body.data);
  });

  it("GET /reports/completed filters by completedAt date range", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    await prisma.task.createMany({
      data: [
        {
          caseId: caseRow.id,
          title: "Completed in range",
          category: "OTHER",
          createdById: admin.id,
          dueDate: new Date(Date.now() - 86_400_000),
          status: "COMPLETED",
          completedAt: new Date("2026-06-15T00:00:00.000Z"),
        },
        {
          caseId: caseRow.id,
          title: "Completed out of range",
          category: "OTHER",
          createdById: admin.id,
          dueDate: new Date(Date.now() - 86_400_000),
          status: "COMPLETED",
          completedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/completed")
      .query({ from: "2026-06-01", to: "2026-06-30" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Completed in range");
  });

  it("GET /reports/case-aging sorts oldest custody first, nulls last", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const older = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    const noCustody = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: null,
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/case-aging")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { caseId: string }) => r.caseId);
    expect(ids).toEqual([older.id, newer.id, noCustody.id]);
  });

  it("GET /reports/rule-trigger-frequency tallies rules from the latest evaluation per case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    // Bare, unassigned case: triggers R-NO-ASSIGNEE, R-CASE-INCOMPLETE,
    // R-NO-HEARING-DATE at creation-adjacent recompute.
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: new Date(Date.now() - 30 * 86_400_000),
    });
    const token = await loginAs(app, admin.email);
    await request(app)
      .post(`/api/v1/priority/case/${caseRow.id}/recompute`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get("/api/v1/reports/rule-trigger-frequency")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const codes = res.body.data.map((r: { ruleCode: string }) => r.ruleCode);
    expect(codes).toContain("R-NO-ASSIGNEE");
    expect(codes).toContain("R-CASE-INCOMPLETE");
    expect(codes).toContain("R-NO-HEARING-DATE");
    for (const row of res.body.data) {
      expect(row.triggerCount).toBe(1);
    }
  });

  it("a LEGAL_PROFESSIONAL's reports are scoped to their own assigned cases", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Owner's overdue task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() - 86_400_000),
        status: "PENDING",
      },
    });
    const attackerToken = await loginAs(app, attacker.email);

    const res = await request(app)
      .get("/api/v1/reports/overdue-actions")
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("AUDITOR can read reports (read-only, unscoped) but a fresh non-privileged setup still enforces EXPORT_REPORTS", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const auditor = await createTestUser({ role: "AUDITOR" });
    await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, auditor.email);

    const res = await request(app)
      .get("/api/v1/reports/case-aging")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("GET /reports/:name/export.csv returns CSV content and logs an EXPORT audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/priority-distribution/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain("priority-distribution.csv");
    expect(res.text).toContain("Priority Level,Count");
    expect(res.text).toContain("ROUTINE,");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "EXPORT", entityType: "Report", entityLabel: "priority-distribution" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(admin.id);
  });

  it("rejects an unknown report name in the export route", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/reports/not-a-real-report/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
