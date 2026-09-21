import type { Prisma } from "@prisma/client";

/**
 * `Case.lastHearingDate`/`nextHearingDate` are denormalized from the
 * Hearing rows (same rationale as `currentPriorityScore` — spec
 * §3/§03-data-model.md: the queue/list reads these far more often than
 * hearings are written). Recomputed after every hearing create/update,
 * in the same transaction.
 */
export async function recomputeCaseHearingDates(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<void> {
  const now = new Date();

  const [last, next] = await Promise.all([
    tx.hearing.findFirst({
      where: { caseId, scheduledDate: { lte: now } },
      orderBy: { scheduledDate: "desc" },
      select: { scheduledDate: true },
    }),
    tx.hearing.findFirst({
      where: { caseId, scheduledDate: { gt: now }, outcome: { not: "CANCELLED" } },
      orderBy: { scheduledDate: "asc" },
      select: { scheduledDate: true },
    }),
  ]);

  await tx.case.update({
    where: { id: caseId },
    data: {
      lastHearingDate: last?.scheduledDate ?? null,
      nextHearingDate: next?.scheduledDate ?? null,
    },
  });
}
