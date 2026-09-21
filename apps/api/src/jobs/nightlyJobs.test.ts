import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedDefaultRuleset,
} from "../test/dbHelpers.js";
import { runNightlyNotificationSweep, runNightlyRecompute } from "./nightlyJobs.js";

describe("nightly recompute job (spec §6.7 / §13)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("recomputes every non-deleted case as a system actor and logs a PRIORITY_RECOMPUTE audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseA = await createTestCase({ createdById: admin.id });
    const caseB = await createTestCase({ createdById: admin.id });

    await runNightlyRecompute();

    for (const caseRow of [caseA, caseB]) {
      const evaluation = await prisma.priorityEvaluation.findFirst({
        where: { caseId: caseRow.id },
      });
      expect(evaluation).not.toBeNull();
      expect(evaluation?.triggeredBy).toBe("SCHEDULED");
      expect(evaluation?.triggeredById).toBeNull();
    }

    const audit = await prisma.auditLog.findFirst({ where: { action: "PRIORITY_RECOMPUTE" } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBeNull();
    expect(audit?.actorEmail).toBe("system@justicegrid.internal");
  });

  it("does not throw when recomputation fails (e.g. no active RulesetConfig) — a nightly cron process must never crash", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    // Deliberately no seedDefaultRuleset: evaluateAndPersistCase throws
    // for lack of an active RulesetConfig, and runNightlyRecompute must
    // swallow that (log it) rather than let it escape uncaught.
    await createTestCase({ createdById: admin.id });

    await expect(runNightlyRecompute()).resolves.toBeUndefined();
  });
});

describe("nightly notification sweep (spec §5's NotificationType)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("notifies the assignee of an overdue task", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Overdue task",
        category: "OTHER",
        assignedToId: lawyer.id,
        createdById: admin.id,
        dueDate: new Date(Date.now() - 2 * 86_400_000),
        status: "PENDING",
      },
    });

    await runNightlyNotificationSweep();

    const notification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "TASK_OVERDUE", relatedEntityId: task.id },
    });
    expect(notification).not.toBeNull();
  });

  it("notifies the assignee of a task due soon", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Due soon task",
        category: "OTHER",
        assignedToId: lawyer.id,
        createdById: admin.id,
        dueDate: new Date(Date.now() + 1 * 86_400_000),
        status: "PENDING",
      },
    });

    await runNightlyNotificationSweep();

    const notification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "TASK_DUE_SOON", relatedEntityId: task.id },
    });
    expect(notification).not.toBeNull();
  });

  it("notifies the case assignee of an approaching hearing", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const hearing = await prisma.hearing.create({
      data: {
        caseId: caseRow.id,
        scheduledDate: new Date(Date.now() + 2 * 86_400_000),
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });

    await runNightlyNotificationSweep();

    const notification = await prisma.notification.findFirst({
      where: { userId: lawyer.id, type: "HEARING_APPROACHING", relatedEntityId: hearing.id },
    });
    expect(notification).not.toBeNull();
  });

  it("does not create a duplicate notification for the same still-overdue task on a second run", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Still overdue",
        category: "OTHER",
        assignedToId: lawyer.id,
        createdById: admin.id,
        dueDate: new Date(Date.now() - 2 * 86_400_000),
        status: "PENDING",
      },
    });

    await runNightlyNotificationSweep();
    await runNightlyNotificationSweep();

    const count = await prisma.notification.count({
      where: { userId: lawyer.id, type: "TASK_OVERDUE", relatedEntityId: task.id },
    });
    expect(count).toBe(1);
  });

  it("does not notify for a task with no assignee, or a cancelled hearing", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id });
    await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Unassigned overdue task",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() - 86_400_000),
        status: "PENDING",
      },
    });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const assignedCase = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    await prisma.hearing.create({
      data: {
        caseId: assignedCase.id,
        scheduledDate: new Date(Date.now() + 86_400_000),
        hearingType: "EVIDENCE",
        outcome: "CANCELLED",
        recordedById: admin.id,
      },
    });

    await runNightlyNotificationSweep();

    const count = await prisma.notification.count();
    expect(count).toBe(0);
  });
});
