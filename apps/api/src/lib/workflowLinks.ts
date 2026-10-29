import type { Prisma } from "@prisma/client";
import { AppError, WorkflowFactsSchema } from "@justicegrid/shared";
export async function validateWorkflowLinks(
  tx: Prisma.TransactionClient,
  caseId: string,
  hearingId?: string | null,
  actionKey?: string | null,
) {
  if (hearingId && !(await tx.hearing.findFirst({ where: { id: hearingId, caseId } })))
    throw new AppError("VALIDATION_ERROR", "Linked hearing must belong to the same case.");
  if (actionKey && !(await tx.workflowAction.findFirst({ where: { caseId, key: actionKey } })))
    throw new AppError("VALIDATION_ERROR", "Linked action must belong to the same case.");
}

export async function invalidateLegalReviews(
  tx: Prisma.TransactionClient,
  caseId: string,
  reason: string,
  invalidateStoredFacts = true,
) {
  await lockCaseWorkflow(tx, caseId);
  await tx.caseRuleEvidence.updateMany({
    where: { caseId },
    data: {
      offenseSeverityIndex: null,
      bailEligibility: null,
      revision: { increment: 1 },
      basis: "Previous inputs invalidated: " + reason,
    },
  });
  const c = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
  const facts = WorkflowFactsSchema.parse(c.workflowFacts);
  facts.currentChargesVerifiedAt = null;
  const custom = await tx.workflowAction.findMany({
    where: { caseId, generated: false, status: { in: ["OPEN", "ACKNOWLEDGED", "BLOCKED"] } },
  });
  for (const a of custom) {
    const payload = a.payload as Record<string, unknown>;
    if (payload.critical)
      await tx.workflowAction.update({
        where: { id: a.id },
        data: {
          payload: {
            ...payload,
            critical: false,
            forthwith: false,
            criticalDataMissing: true,
            origin: "TEAM_TARGET",
            invalidatedReason: reason,
            evidence: String(payload.evidence) + "; Reconfirmation required: " + reason,
          } as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
  }
  for (const review of facts.confirmedReviews.filter((r) => !r.completedAt))
    review.invalidatedReason = reason;
  if (invalidateStoredFacts)
    await tx.case.update({
      where: { id: caseId },
      data: {
        workflowFacts: JSON.parse(JSON.stringify(facts)) as Prisma.InputJsonValue,
        workflowRevision: { increment: 1 },
      },
    });
}

/** All case writers take policy shared lock before case lock or row writes. */
export async function lockCaseWorkflow(tx: Prisma.TransactionClient, caseId?: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext('queue-policy-publication'))`;
  // One global ordering point prevents case/audit/generation lock-order inversion.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('queue-case-writer'))`;
  if (caseId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"queue-case:" + caseId}))`;
}
