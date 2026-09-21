import type { Prisma } from "@prisma/client";

/**
 * `Case.lastActivityAt` feeds the NO_ACTIVITY_SINCE_DAYS rule condition
 * (spec §6.3) — every hearing/task/document/note mutation touches it, in
 * the same transaction as that mutation.
 */
export async function touchCaseActivity(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<void> {
  await tx.case.update({ where: { id: caseId }, data: { lastActivityAt: new Date() } });
}
