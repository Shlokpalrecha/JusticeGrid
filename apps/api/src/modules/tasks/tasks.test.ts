import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestCase, createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("tasks", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("creates a task on a case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Prepare bail application",
        category: "BAIL_APPLICATION",
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
  });

  it("rejects a dueDate in the past on creation", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Overdue-by-design task",
        category: "OTHER",
        dueDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("completes a task", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/tasks/${task.id}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ completionNote: "Done" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("COMPLETED");
    expect(res.body.data.completedById).toBe(admin.id);
  });

  it("cannot complete a CANCELLED task (spec §8.5)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Cancelled task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86400000),
        status: "CANCELLED",
        cancelledReason: "No longer needed",
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/tasks/${task.id}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");

    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.status).toBe("CANCELLED");
  });

  it("reassigns a task to an active user", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/tasks/${task.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assignedToId: lawyer.id });

    expect(res.status).toBe(200);
    expect(res.body.data.assignedToId).toBe(lawyer.id);
  });

  it("rejects reassigning a task to an inactive user", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const inactive = await createTestUser({ role: "LEGAL_PROFESSIONAL", isActive: false });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/tasks/${task.id}/reassign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assignedToId: inactive.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /tasks/my-queue returns only tasks assigned to the caller", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Mine",
        category: "OTHER",
        createdById: admin.id,
        assignedToId: lawyer.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Not mine",
        category: "OTHER",
        createdById: admin.id,
        assignedToId: admin.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .get("/api/v1/tasks/my-queue")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Mine");
  });

  it("GET /tasks?overdue=true returns only overdue open tasks", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Overdue",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() - 86400000),
      },
    });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Not due yet",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/tasks?overdue=true")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Overdue");
  });
});
