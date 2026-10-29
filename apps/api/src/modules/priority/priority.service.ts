import { orderActiveQueue } from "../../lib/activeHeap.js";
import type { Prisma, Role } from "@prisma/client";
import {
  ENGINE_VERSION,
  evaluateCase,
  type EvaluationResult,
  type WorkflowInput,
  type Policy,
} from "@justicegrid/rules-engine";
import {
  AppError,
  type PriorityDistribution,
  type PriorityEvaluationDto,
  type PriorityQueueFilter,
  type PriorityQueueItemDto,
} from "@justicegrid/shared";
import { type AuditRequestContext, writeAuditEntry } from "../../lib/audit.js";
import { hasUnscopedCaseVisibility, loadAccessibleCase } from "../../lib/caseAccess.js";
import { evaluateAndPersistCase, loadActivePolicy } from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";
import { lockCaseWorkflow } from "../../lib/workflowLinks.js";
export interface QueueActor {
  id: string;
  email: string;
  role: Role;
}
export function scope(actor: QueueActor): Prisma.CaseWhereInput {
  return {
    deletedAt: null,
    ...(hasUnscopedCaseVisibility(actor.role) ? {} : { assignedToId: actor.id }),
  };
}
const refreshes = new Map<string, Promise<void>>();
export async function refreshScope(actor?: QueueActor, force = false): Promise<void> {
  const key = `${actor?.id ?? "all"}:${force}`;
  const existing = refreshes.get(key);
  if (existing) return existing;
  const pending = refreshCases(actor, force);
  refreshes.set(key, pending);
  try {
    await pending;
  } finally {
    refreshes.delete(key);
  }
}
async function refreshCases(actor?: QueueActor, force = false): Promise<void> {
  const now = new Date();
  const cases = await prisma.case.findMany({
    where: {
      ...(actor ? scope(actor) : { deletedAt: null }),
      ...(force
        ? {}
        : { OR: [{ queueNextEvaluationAt: null }, { queueNextEvaluationAt: { lte: now } }] }),
    },
    select: { id: true },
  });
  for (const c of cases) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await lockCaseWorkflow(tx, c.id);
          const current = await tx.case.findUniqueOrThrow({
            where: { id: c.id },
            select: { queueNextEvaluationAt: true },
          });
          if (!force && current.queueNextEvaluationAt && current.queueNextEvaluationAt > now)
            return;
          await evaluateAndPersistCase(tx, c.id, { triggeredBy: "SCHEDULED", now });
        },
        { timeout: 30_000 },
      );
    } catch {
      await prisma.case.update({
        where: { id: c.id },
        data: {
          queueError:
            "Evaluation failed; last valid evaluation retained. Review case facts and policy.",
          queueNextEvaluationAt: new Date(now.getTime() + 60_000),
        },
      });
    }
  }
}
function dto(
  row: { id: string; result: Prisma.JsonValue; triggeredBy: string; triggeredById: string | null },
  error: string | null,
  nextCheck: Date | null,
  now: Date,
  lastCheckedAt?: Date | null,
): PriorityEvaluationDto {
  const result = row.result as unknown as EvaluationResult;
  return {
    ...result,
    id: row.id,
    triggeredBy: row.triggeredBy,
    triggeredById: row.triggeredById,
    lastCheckedAt: lastCheckedAt?.toISOString() ?? result.evaluatedAt,
    nextCheckAt: nextCheck?.toISOString() ?? null,
    stale: !!error || !nextCheck || nextCheck <= now,
    error,
  } as PriorityEvaluationDto;
}
export async function getQueue(
  actor: QueueActor,
  filter: PriorityQueueFilter,
): Promise<{ items: PriorityQueueItemDto[]; total: number }> {
  await refreshScope(actor);
  return prisma.$transaction(
    async (tx) => {
      const policy = await loadActivePolicy(tx);
      const where: Prisma.CaseWhereInput = {
        AND: [
          scope(actor),
          ...(filter.assignedTo ? [{ assignedToId: filter.assignedTo }] : []),
          ...(filter.hearingFrom || filter.hearingTo
            ? [
                {
                  nextHearingDate: {
                    ...(filter.hearingFrom ? { gte: new Date(filter.hearingFrom) } : {}),
                    ...(filter.hearingTo ? { lte: new Date(filter.hearingTo) } : {}),
                  },
                },
              ]
            : []),
        ],
      };
      const cases = await tx.case.findMany({
        where,
        include: {
          person: { select: { aliasCode: true } },
          assignedTo: { select: { id: true, fullName: true, role: true } },
          queueEvaluations: { orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }], take: 1 },
        },
      });
      const byId = new Map(cases.map((c) => [c.id, c]));
      const results = cases.flatMap((c) => {
        const row = c.queueEvaluations[0];
        if (!row) {
          if (c.queueError)
            throw new AppError(
              "INTERNAL_ERROR",
              "A case could not be evaluated. Its priority is unknown; review the queue error.",
            );
          return [];
        }
        if (row.policyVersion !== policy.version)
          throw new AppError("CONFLICT", "Queue policy changed. Reload the queue.");
        return [row.result as unknown as EvaluationResult];
      });
      const generation=await tx.systemGeneration.findUnique({where:{id:"queue"}});
      let ordered = orderActiveQueue(actor.id+":"+JSON.stringify(filter),results,generation?.revision??0).filter(
        (r) =>
          (!filter.priority || r.priorityLevel === filter.priority) &&
          (!filter.actionType || r.actions.some((a) => a.type === filter.actionType)),
      );
      if (filter.lane === "REFERRAL")
        ordered = ordered.filter((r) =>
          r.actions.some((a) => a.urgency === "U0" && a.type === "A01"),
        );
      if (filter.lane === "LEGAL_DEADLINE")
        ordered = ordered.filter((r) =>
          r.actions.some((a) => a.urgency === "U0" && a.type !== "A01"),
        );
      if (filter.lane === "OLDEST") {
        const oldest = (r: EvaluationResult) =>
          Math.min(...r.actions.map((a) => Date.parse(a.activatedAt)));
        ordered = ordered
          .filter((r) => r.actions.length > 0 && ["U2", "U3"].includes(r.priorityLevel))
          .sort((a, b) => oldest(a) - oldest(b) || (a.caseRef < b.caseRef ? -1 : 1));
      }
      const total = ordered.length,
        skip = (filter.page - 1) * filter.pageSize,
        now = new Date();
      const items = ordered.slice(skip, skip + filter.pageSize).map((r, i) => {
        const c = byId.get(r.caseId)!;
        return {
          rank: skip + i + 1,
          caseId: c.id,
          caseRef: c.caseRef,
          personAlias: c.person.aliasCode,
          assignedTo: c.assignedTo,
          nextHearingDate: r.nextHearingAt,
          evaluation: dto(
            c.queueEvaluations[0]!,
            c.queueError,
            c.queueNextEvaluationAt,
            now,
            c.lastEvaluatedAt,
          ),
        };
      });
      return { items, total };
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}
export async function getCasePriority(
  actor: QueueActor,
  caseId: string,
): Promise<PriorityEvaluationDto> {
  await loadAccessibleCase(prisma, actor, caseId);
  await refreshScope(actor);
  return prisma.$transaction(
    async (tx) => {
      const c = await loadAccessibleCase(tx, actor, caseId),
        policy = await loadActivePolicy(tx);
      const row = await tx.queueEvaluation.findFirst({
        where: { caseId },
        orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }],
      });
      if (!row)
        throw new AppError("NOT_FOUND", c.queueError ?? "No action evaluation is available.");
      if (row.policyVersion !== policy.version)
        throw new AppError("CONFLICT", "Queue policy changed. Reload the case.");
      return dto(row, c.queueError, c.queueNextEvaluationAt, new Date(), c.lastEvaluatedAt);
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getCasePriorityHistory(
  actor: QueueActor,
  caseId: string,
): Promise<PriorityEvaluationDto[]> {
  await getCasePriority(actor, caseId);
  const rows = await prisma.queueEvaluation.findMany({
    where: { caseId },
    orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const c = await loadAccessibleCase(prisma, actor, caseId);
  return rows.map((row, index) =>
    dto(
      row,
      index === 0 ? c.queueError : null,
      index === 0 ? c.queueNextEvaluationAt : new Date(8.64e15),
      new Date(),
      index === 0 ? c.lastEvaluatedAt : row.evaluatedAt,
    ),
  );
}
export async function recomputeCase(
  actor: QueueActor,
  caseId: string,
  request: AuditRequestContext,
): Promise<PriorityEvaluationDto> {
  await prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId);
      await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
      await writeAuditEntry(tx, actor, request, {
        action: "PRIORITY_RECOMPUTE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: "Re-evaluated action-based workflow priority",
      });
    },
    { timeout: 30_000 },
  );
  return getCasePriority(actor, caseId);
}
export async function getDistribution(actor: QueueActor): Promise<PriorityDistribution> {
  const dist: PriorityDistribution = { U0: 0, U1: 0, U2: 0, U3: 0 };
  await refreshScope(actor);
  return prisma.$transaction(
    async (tx) => {
      const policy = await loadActivePolicy(tx);
      const cases = await tx.case.findMany({
        where: scope(actor),
        include: {
          queueEvaluations: { orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }], take: 1 },
        },
      });
      for (const c of cases) {
        const row = c.queueEvaluations[0];
        if (!row) {
          if (c.queueError)
            throw new AppError("INTERNAL_ERROR", "An unevaluated case has unknown priority.");
          continue;
        }
        if (row.policyVersion !== policy.version)
          throw new AppError("CONFLICT", "Queue policy changed. Reload the queue.");
        const r = row.result as unknown as EvaluationResult;
        if (r.included) dist[r.priorityLevel]++;
      }
      return dist;
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function replayEvaluation(actor: QueueActor, id: string) {
  const row = await prisma.queueEvaluation.findUnique({ where: { id } });
  if (!row) throw new AppError("NOT_FOUND", "Evaluation not found.");
  await loadAccessibleCase(prisma, actor, row.caseId);
  const recordedVersion=(row.result as unknown as EvaluationResult).engineVersion;
  if (recordedVersion!==ENGINE_VERSION) throw new AppError("VALIDATION_ERROR", `Recorded engine ${recordedVersion} differs from current engine ${ENGINE_VERSION}. The historical snapshot is retained; exact replay requires its original engine.`);
  const result = evaluateCase(
    row.inputSnapshot as unknown as WorkflowInput,
    row.policySnapshot as unknown as Policy,
    row.evaluatedAt,
    row.policyVersion,
  );
  return { matches: result.outcomeHash === row.outcomeHash, result };
}
