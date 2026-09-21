import type { NotificationType, Prisma } from "@prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

/**
 * Inserts one Notification row (spec §5). Callers pass the same `tx`
 * their business mutation runs in, so a notification is never created
 * for a mutation that ends up rolling back — mirroring `writeAuditEntry`
 * (lib/audit.ts)'s transactional-coupling rationale, though notifications
 * are a best-effort UX signal rather than a tamper-evident record, so
 * there is no hash chain here.
 */
export async function createNotification(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput,
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    },
  });
}

/**
 * Skips notifying a user about their own action — e.g. a
 * LEGAL_PROFESSIONAL who self-assigns a case shouldn't get a "case
 * assigned to you" notification for something they just did themselves.
 * Every event-driven trigger site (cases/tasks/documents services) calls
 * this before `createNotification`; the nightly sweep (jobs/
 * nightlyJobs.ts) has no "actor" at all, so it never needs it.
 */
export function shouldNotify(targetUserId: string | null, actorId: string): boolean {
  return targetUserId !== null && targetUserId !== actorId;
}

/**
 * Skips creating a duplicate notification for the same user, type, and
 * related entity — the nightly sweep (TASK_DUE_SOON / TASK_OVERDUE /
 * HEARING_APPROACHING) runs daily and would otherwise re-notify for the
 * same still-overdue task every night. Event-driven triggers (task
 * assigned, case assigned, document requested, priority escalated) don't
 * need this: each of those events is itself a distinct occurrence worth
 * a fresh notification.
 */
export async function notifyOnceFor(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput & { relatedEntityId: string },
): Promise<void> {
  const existing = await tx.notification.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      relatedEntityId: input.relatedEntityId,
    },
    select: { id: true },
  });
  if (existing) return;
  await createNotification(tx, input);
}
