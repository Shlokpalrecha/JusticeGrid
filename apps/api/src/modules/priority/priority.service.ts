import type { EvaluationResult } from "@justicegrid/rules-engine";
import {
  AppError,
  type PriorityDistribution,
  type PriorityEvaluationDto,
  type PriorityQueueFilter,
  type PriorityQueueItemDto,
} from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { hasUnscopedCaseVisibility, loadAccessibleCase } from "../../lib/caseAccess.js";
import {
  buildCaseEvaluationInput,
  buildQueue,
  evaluateAndPersistCase,
  reconstructEvaluationResult,
} from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
  email: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

async function toEvaluationDtoFromRow(
  evaluation: {
    id: string;
    caseId: string;
    rawScore: number;
    totalScore: number;
    priorityLevel: string;
    rulesetVersion: number;
    engineVersion: string;
    inputHash: string;
    evaluatedAt: Date;
    triggeredCount: number;
    durationMs: number;
    triggeredBy: string;
    triggeredById: string | null;
  },
  reasonRows: {
    id: string;
    evaluationId: string;
    ruleId: string | null;
    ruleCode: string;
    ruleName: string;
    points: number;
    category: string;
    reasonText: string;
    evidenceJson: unknown;
    orderIndex: number;
  }[],
): Promise<PriorityEvaluationDto> {
  const result = await reconstructEvaluationResult(prisma, evaluation, reasonRows);
  const byId = new Map(reasonRows.map((r) => [r.orderIndex, r]));
  return {
    id: evaluation.id,
    caseId: evaluation.caseId,
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
    totalScore: evaluation.totalScore,
    rawScore: evaluation.rawScore,
    priorityLevel: result.priorityLevel,
    rulesetVersion: evaluation.rulesetVersion,
    engineVersion: evaluation.engineVersion,
    inputHash: evaluation.inputHash,
    triggeredCount: evaluation.triggeredCount,
    durationMs: evaluation.durationMs,
    triggeredBy: evaluation.triggeredBy as PriorityEvaluationDto["triggeredBy"],
    triggeredById: evaluation.triggeredById,
    reasons: result.reasons.map((r) => {
      const row = byId.get(r.orderIndex);
      return {
        id: row?.id ?? "",
        evaluationId: evaluation.id,
        ruleId: r.ruleId || null,
        ruleCode: r.ruleCode,
        ruleName: r.ruleName,
        points: r.points,
        category: r.category as PriorityEvaluationDto["reasons"][number]["category"],
        reasonText: r.reasonText,
        evidence: r.evidence,
        orderIndex: r.orderIndex,
      };
    }),
    explanation: result.explanation,
  };
}

async function latestEvaluationForCase(caseId: string) {
  const evaluation = await prisma.priorityEvaluation.findFirst({
    where: { caseId },
    orderBy: { evaluatedAt: "desc" },
    include: { reasons: true },
  });
  return evaluation;
}

export async function getQueue(
  actor: ActorContext,
  filter: PriorityQueueFilter,
): Promise<{ items: PriorityQueueItemDto[]; total: number }> {
  const where: Record<string, unknown> = { deletedAt: null, currentPriorityScore: { not: null } };
  if (!hasUnscopedCaseVisibility(actor.role)) where.assignedToId = actor.id;
  if (filter.priority) where.currentPriorityLevel = filter.priority;
  if (filter.assignedTo) where.assignedToId = filter.assignedTo;
  if (filter.hearingFrom || filter.hearingTo) {
    where.nextHearingDate = {
      ...(filter.hearingFrom ? { gte: new Date(filter.hearingFrom) } : {}),
      ...(filter.hearingTo ? { lte: new Date(filter.hearingTo) } : {}),
    };
  }

  const cases = await prisma.case.findMany({
    where,
    include: {
      person: { select: { aliasCode: true } },
      assignedTo: { select: { id: true, fullName: true, role: true } },
    },
  });

  let withEvaluations = await Promise.all(
    cases.map(async (c) => ({ case: c, evaluation: await latestEvaluationForCase(c.id) })),
  );
  withEvaluations = withEvaluations.filter((x) => x.evaluation !== null);

  if (filter.ruleCode) {
    withEvaluations = withEvaluations.filter((x) =>
      x.evaluation!.reasons.some((r) => r.ruleCode === filter.ruleCode),
    );
  }

  const total = withEvaluations.length;

  // Full tie-breaker fidelity (spec §6.5) via the engine's own
  // buildQueue, rather than a parallel re-implementation of its 5-step
  // comparator here — see lib/priorityEvaluation.ts's header comment.
  const inputs = await Promise.all(
    withEvaluations.map((x) => buildCaseEvaluationInput(prisma, x.case.id)),
  );
  const results: EvaluationResult[] = await Promise.all(
    withEvaluations.map((x) =>
      reconstructEvaluationResult(prisma, x.evaluation!, x.evaluation!.reasons),
    ),
  );
  const ordered = buildQueue(results, inputs);

  const { skip, take } = { skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize };
  const page = ordered.slice(skip, skip + take);

  const byCaseId = new Map(withEvaluations.map((x) => [x.case.id, x]));
  const items: PriorityQueueItemDto[] = await Promise.all(
    page.map(async (result, index) => {
      const entry = byCaseId.get(result.caseId);
      if (!entry) throw new AppError("INTERNAL_ERROR", "Queue ordering returned an unknown case.");
      const dto = await toEvaluationDtoFromRow(entry.evaluation!, entry.evaluation!.reasons);
      return {
        rank: skip + index + 1,
        caseId: entry.case.id,
        caseRef: entry.case.caseRef,
        personAlias: entry.case.person.aliasCode,
        nextHearingDate: entry.case.nextHearingDate?.toISOString() ?? null,
        assignedTo: entry.case.assignedTo
          ? {
              id: entry.case.assignedTo.id,
              fullName: entry.case.assignedTo.fullName,
              role: entry.case.assignedTo.role,
            }
          : null,
        evaluation: dto,
      };
    }),
  );

  return { items, total };
}

export async function getCasePriority(
  actor: ActorContext,
  caseId: string,
): Promise<PriorityEvaluationDto> {
  await loadAccessibleCase(prisma, actor, caseId);
  const evaluation = await latestEvaluationForCase(caseId);
  if (!evaluation) {
    throw new AppError("NOT_FOUND", "This case has not been evaluated yet.");
  }
  return toEvaluationDtoFromRow(evaluation, evaluation.reasons);
}

export async function getCasePriorityHistory(
  actor: ActorContext,
  caseId: string,
): Promise<PriorityEvaluationDto[]> {
  await loadAccessibleCase(prisma, actor, caseId);
  const evaluations = await prisma.priorityEvaluation.findMany({
    where: { caseId },
    orderBy: { evaluatedAt: "desc" },
    include: { reasons: true },
  });
  return Promise.all(evaluations.map((e) => toEvaluationDtoFromRow(e, e.reasons)));
}

export async function recomputeCase(
  actor: ActorContext,
  caseId: string,
  request: AuditRequestContext,
): Promise<PriorityEvaluationDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  await prisma.$transaction(async (tx) => {
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    await writeAuditEntry(tx, actor, request, {
      action: "PRIORITY_RECOMPUTE",
      entityType: "Case",
      entityId: caseId,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} manually recomputed the priority for case ${caseRow.caseRef}`,
    });
  });

  return getCasePriority(actor, caseId);
}

export async function getDistribution(actor: ActorContext): Promise<PriorityDistribution> {
  const where: Record<string, unknown> = { deletedAt: null, currentPriorityLevel: { not: null } };
  if (!hasUnscopedCaseVisibility(actor.role)) where.assignedToId = actor.id;

  const [routine, medium, high] = await Promise.all([
    prisma.case.count({ where: { ...where, currentPriorityLevel: "ROUTINE" } }),
    prisma.case.count({ where: { ...where, currentPriorityLevel: "MEDIUM" } }),
    prisma.case.count({ where: { ...where, currentPriorityLevel: "HIGH" } }),
  ]);

  return { ROUTINE: routine, MEDIUM: medium, HIGH: high };
}
