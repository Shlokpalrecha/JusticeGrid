import { randomUUID } from "node:crypto";
import cron, { type ScheduledTask } from "node-cron";
import type { AuditActor, AuditRequestContext } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { notifyOnceFor } from "../lib/notifications.js";
import { prisma } from "../lib/prisma.js";
import { recomputeAllCases } from "../modules/rules/rules.service.js";

/**
 * spec §6.7 / §13: every case is recomputed nightly at 02:00 IST, because
 * day-boundary crossings change what "overdue" or "within N days" means
 * even when nothing about the case itself changed. Runs as a system
 * actor (`id: null`) — `lib/audit.ts`'s `AuditActor` and
 * `rules.service.ts`'s `recomputeAllCases` both support this explicitly,
 * since there is no authenticated user behind a scheduled trigger.
 */
const SYSTEM_ACTOR: AuditActor = {
  id: null,
  email: "system@justicegrid.internal",
  role: null,
};

export async function runNightlyRecompute(): Promise<void> {
  const request: AuditRequestContext = {
    ipAddress: null,
    userAgent: "node-cron/nightly-recompute",
    requestId: randomUUID(),
  };

  logger.info("Nightly priority recompute starting");
  try {
    const { recomputedCount } = await recomputeAllCases(SYSTEM_ACTOR, request, "SCHEDULED");
    logger.info({ recomputedCount }, "Nightly priority recompute finished");
  } catch (err) {
    logger.error({ err }, "Nightly priority recompute failed");
  }
}

const OPEN_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED"] as const;
const DUE_SOON_WINDOW_DAYS = 2;
const HEARING_APPROACHING_WINDOW_DAYS = 3;

/**
 * The day-boundary-driven half of spec §5's NotificationType set
 * (TASK_DUE_SOON, TASK_OVERDUE, HEARING_APPROACHING) — unlike
 * CASE_ASSIGNED/TASK_ASSIGNED/DOCUMENT_REQUESTED/PRIORITY_ESCALATED
 * (event-driven, wired directly into cases/tasks/documents/
 * priorityEvaluation), "due soon" and "overdue" are properties of the
 * calendar date crossing a threshold, not of any single mutation — so,
 * like the recompute above, they belong in the nightly sweep rather than
 * an event hook. `notifyOnceFor` (lib/notifications.ts) de-duplicates
 * per (user, type, entity) so a still-overdue task or still-upcoming
 * hearing doesn't re-notify every night.
 */
export async function runNightlyNotificationSweep(): Promise<void> {
  logger.info("Nightly notification sweep starting");
  try {
    const now = new Date();
    const dueSoonBy = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 86_400_000);
    const hearingWindowEnd = new Date(now.getTime() + HEARING_APPROACHING_WINDOW_DAYS * 86_400_000);

    const [overdueTasks, dueSoonTasks, approachingHearings] = await Promise.all([
      prisma.task.findMany({
        where: {
          status: { in: [...OPEN_TASK_STATUSES] },
          dueDate: { lt: now },
          assignedToId: { not: null },
        },
        include: { case: { select: { caseRef: true } } },
      }),
      prisma.task.findMany({
        where: {
          status: { in: [...OPEN_TASK_STATUSES] },
          dueDate: { gte: now, lte: dueSoonBy },
          assignedToId: { not: null },
        },
        include: { case: { select: { caseRef: true } } },
      }),
      prisma.hearing.findMany({
        where: {
          scheduledDate: { gte: now, lte: hearingWindowEnd },
          outcome: { not: "CANCELLED" },
        },
        include: { case: { select: { caseRef: true, assignedToId: true } } },
      }),
    ]);

    await prisma.$transaction(async (tx) => {
      for (const task of overdueTasks) {
        await notifyOnceFor(tx, {
          userId: task.assignedToId as string,
          type: "TASK_OVERDUE",
          title: "Task overdue",
          body: `Task "${task.title}" on case ${task.case.caseRef} is overdue.`,
          relatedEntityType: "Task",
          relatedEntityId: task.id,
        });
      }
      for (const task of dueSoonTasks) {
        await notifyOnceFor(tx, {
          userId: task.assignedToId as string,
          type: "TASK_DUE_SOON",
          title: "Task due soon",
          body: `Task "${task.title}" on case ${task.case.caseRef} is due soon.`,
          relatedEntityType: "Task",
          relatedEntityId: task.id,
        });
      }
      for (const hearing of approachingHearings) {
        if (!hearing.case.assignedToId) continue;
        await notifyOnceFor(tx, {
          userId: hearing.case.assignedToId,
          type: "HEARING_APPROACHING",
          title: "Hearing approaching",
          body: `A ${hearing.hearingType} hearing on case ${hearing.case.caseRef} is coming up.`,
          relatedEntityType: "Hearing",
          relatedEntityId: hearing.id,
        });
      }
    });

    logger.info(
      {
        overdueCount: overdueTasks.length,
        dueSoonCount: dueSoonTasks.length,
        hearingCount: approachingHearings.length,
      },
      "Nightly notification sweep finished",
    );
  } catch (err) {
    logger.error({ err }, "Nightly notification sweep failed");
  }
}

/**
 * Starts the nightly cron schedule. Called once from `server.ts` (never
 * from `app.ts`, which `vitest`'s integration tests instantiate directly
 * and repeatedly via `createApp()` — scheduling a real cron task there
 * would leak a timer per test file).
 */
export function startScheduledJobs(): ScheduledTask {
  return cron.schedule(
    "0 2 * * *",
    () => {
      void runNightlyRecompute().then(() => runNightlyNotificationSweep());
    },
    { timezone: "Asia/Kolkata" },
  );
}
