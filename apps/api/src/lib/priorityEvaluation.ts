import type { Prisma, PrismaClient, RuleCategory } from "@prisma/client";
import {
  buildExplanation,
  buildQueue as engineBuildQueue,
  evaluateCase,
  type CaseEvaluationInput,
  type EvaluationResult,
  type RuleDefinition,
  type RuleParams,
  type RulesetConfig as EngineRulesetConfig,
  type TriggeredReasonResult,
} from "@justicegrid/rules-engine";
import { AppError, type EvaluationTrigger } from "@justicegrid/shared";
import { computeRequiredFieldsPresent } from "./caseFieldCompleteness.js";
import { createNotification } from "./notifications.js";

type Client = PrismaClient | Prisma.TransactionClient;

/** Ordering for detecting a PRIORITY_ESCALATED notification (spec §5's
 * NotificationType) — only an INCREASE in band is an escalation. */
const PRIORITY_LEVEL_RANK: Record<EvaluationResult["priorityLevel"], number> = {
  ROUTINE: 0,
  MEDIUM: 1,
  HIGH: 2,
};

/**
 * This file is the ONLY place that translates between Prisma rows and
 * @justicegrid/rules-engine's plain input/output shapes (spec §4's
 * architectural rule: the engine package itself imports nothing and
 * knows nothing about Prisma). Every Phase 5 route — recompute, queue,
 * simulate — goes through the functions here rather than calling
 * `evaluateCase`/`buildQueue` directly with ad hoc mappings.
 */

export function toRuleDefinition(rule: {
  id: string;
  code: string;
  name: string;
  category: RuleCategory;
  conditionType: string;
  params: unknown;
  weight: number;
  isEnabled: boolean;
  displayTemplate: string;
  version: number;
}): RuleDefinition {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    category: rule.category,
    conditionType: rule.conditionType as RuleDefinition["conditionType"],
    params: rule.params as RuleParams,
    weight: rule.weight,
    isEnabled: rule.isEnabled,
    displayTemplate: rule.displayTemplate,
    version: rule.version,
  };
}

export async function loadRuleDefinitions(client: Client): Promise<RuleDefinition[]> {
  const rules = await client.rule.findMany();
  return rules.map(toRuleDefinition);
}

export interface ActiveRulesetConfig {
  id: string;
  engine: EngineRulesetConfig;
}

export async function loadActiveRulesetConfig(client: Client): Promise<ActiveRulesetConfig> {
  const config = await client.rulesetConfig.findFirst({ where: { isActive: true } });
  if (!config) {
    throw new AppError(
      "INTERNAL_ERROR",
      "No active RulesetConfig exists. An administrator must configure the ruleset before cases can be evaluated.",
    );
  }
  return {
    id: config.id,
    engine: {
      version: config.version,
      highThreshold: config.highThreshold,
      mediumThreshold: config.mediumThreshold,
      maxScoreCap: config.maxScoreCap ?? undefined,
    },
  };
}

/** Count of trailing ADJOURNED outcomes starting from the most recent
 * hearing — HEARING_ADJOURNED_CONSECUTIVELY's input (spec §6.3). */
function countConsecutiveAdjournments(hearingsDesc: { outcome: string }[]): number {
  let count = 0;
  for (const h of hearingsDesc) {
    if (h.outcome !== "ADJOURNED") break;
    count++;
  }
  return count;
}

export async function buildCaseEvaluationInput(
  client: Client,
  caseId: string,
): Promise<CaseEvaluationInput> {
  const caseRow = await client.case.findUnique({ where: { id: caseId } });
  if (!caseRow) {
    throw new AppError("NOT_FOUND", "Case not found.");
  }

  const [chargeCount, tasks, documents, hearingsDesc] = await Promise.all([
    client.charge.count({ where: { caseId } }),
    client.task.findMany({ where: { caseId } }),
    client.documentRequirement.findMany({ where: { caseId } }),
    client.hearing.findMany({ where: { caseId }, orderBy: { scheduledDate: "desc" } }),
  ]);

  const now = Date.now();
  const lastHearingRow = hearingsDesc.find((h) => h.scheduledDate.getTime() <= now) ?? null;

  return {
    caseId: caseRow.id,
    caseRef: caseRow.caseRef,
    assignedToId: caseRow.assignedToId,
    caseStatus: caseRow.caseStatus,
    custodyType: caseRow.custodyType,
    custodyStartDate: caseRow.custodyStartDate?.toISOString() ?? null,
    nextHearingDate: caseRow.nextHearingDate?.toISOString() ?? null,
    lastHearingDate: caseRow.lastHearingDate?.toISOString() ?? null,
    lastActivityAt: caseRow.lastActivityAt.toISOString(),
    bailStatus: caseRow.bailStatus,
    bailAppliedDate: caseRow.bailAppliedDate?.toISOString() ?? null,
    consecutiveAdjournments: countConsecutiveAdjournments(hearingsDesc),
    requiredFieldsPresent: computeRequiredFieldsPresent(caseRow, chargeCount),
    lastHearing: lastHearingRow
      ? {
          id: lastHearingRow.id,
          scheduledDate: lastHearingRow.scheduledDate.toISOString(),
          orderReviewed: lastHearingRow.orderReviewed,
          orderRecordedAt: lastHearingRow.orderReviewedAt?.toISOString() ?? null,
        }
      : null,
    tasks: tasks.map((t) => ({
      id: t.id,
      status: t.status,
      dueDate: t.dueDate.toISOString(),
      assignedToId: t.assignedToId,
      isPreparationTask: t.isPreparationTask,
      blockedSince: t.blockedSince?.toISOString() ?? null,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      isMandatory: d.isMandatory,
      status: d.status,
      requestedAt: d.requestedAt?.toISOString() ?? null,
    })),
  };
}

export interface EvaluateAndPersistOptions {
  triggeredBy: EvaluationTrigger;
  triggeredById?: string | null;
}

/**
 * Evaluates one case and persists the result (spec §6.7). Idempotent:
 * writes a new PriorityEvaluation row (+ its TriggeredReasons) only if
 * `inputHash` or `rulesetVersion` changed since the last evaluation for
 * this case — otherwise only `Case.lastEvaluatedAt` is bumped, exactly
 * the optimization spec §6.7 documents. Must be called with `tx` inside
 * the same transaction as whatever mutation triggered it (or its own
 * dedicated transaction for a standalone recompute).
 */
export async function evaluateAndPersistCase(
  tx: Prisma.TransactionClient,
  caseId: string,
  options: EvaluateAndPersistOptions,
): Promise<EvaluationResult> {
  const [input, rules, { engine: config }] = await Promise.all([
    buildCaseEvaluationInput(tx, caseId),
    loadRuleDefinitions(tx),
    loadActiveRulesetConfig(tx),
  ]);

  const now = new Date();
  const evalStart = Date.now();
  const result = evaluateCase(input, rules, config, now);
  const durationMs = Math.max(0, Date.now() - evalStart);

  const latest = await tx.priorityEvaluation.findFirst({
    where: { caseId },
    orderBy: { evaluatedAt: "desc" },
  });

  const unchanged =
    latest !== null &&
    latest.inputHash === result.inputHash &&
    latest.rulesetVersion === result.rulesetVersion;

  if (unchanged) {
    await tx.case.update({ where: { id: caseId }, data: { lastEvaluatedAt: now } });
    return result;
  }

  const evaluation = await tx.priorityEvaluation.create({
    data: {
      caseId,
      evaluatedAt: now,
      totalScore: result.totalScore,
      rawScore: result.rawScore,
      priorityLevel: result.priorityLevel,
      rulesetVersion: result.rulesetVersion,
      engineVersion: result.engineVersion,
      inputHash: result.inputHash,
      triggeredCount: result.reasons.length,
      durationMs,
      triggeredBy: options.triggeredBy,
      triggeredById: options.triggeredById ?? null,
    },
  });

  if (result.reasons.length > 0) {
    await tx.triggeredReason.createMany({
      data: result.reasons.map((reason) => ({
        evaluationId: evaluation.id,
        ruleId: reason.ruleId,
        ruleCode: reason.ruleCode,
        ruleName: reason.ruleName,
        points: reason.points,
        category: reason.category as RuleCategory,
        reasonText: reason.reasonText,
        evidenceJson: reason.evidence as Prisma.InputJsonValue,
        orderIndex: reason.orderIndex,
      })),
    });
  }

  await tx.case.update({
    where: { id: caseId },
    data: {
      currentPriorityScore: result.totalScore,
      currentPriorityLevel: result.priorityLevel,
      lastEvaluatedAt: now,
    },
  });

  if (
    latest !== null &&
    input.assignedToId &&
    PRIORITY_LEVEL_RANK[result.priorityLevel] >
      PRIORITY_LEVEL_RANK[latest.priorityLevel as EvaluationResult["priorityLevel"]]
  ) {
    await createNotification(tx, {
      userId: input.assignedToId,
      type: "PRIORITY_ESCALATED",
      title: "Case priority escalated",
      body: `Case ${input.caseRef} escalated from ${latest.priorityLevel} to ${result.priorityLevel}.`,
      relatedEntityType: "Case",
      relatedEntityId: caseId,
    });
  }

  return result;
}

export { engineBuildQueue as buildQueue };

interface StoredEvaluationRow {
  caseId: string;
  rawScore: number;
  totalScore: number;
  priorityLevel: string;
  rulesetVersion: number;
  engineVersion: string;
  inputHash: string;
  evaluatedAt: Date;
}

interface StoredReasonRow {
  ruleId: string | null;
  ruleCode: string;
  ruleName: string;
  points: number;
  category: string;
  reasonText: string;
  evidenceJson: unknown;
  orderIndex: number;
}

/**
 * Reconstructs a full `EvaluationResult` (including `explanation`, spec
 * §6.1/§9) from a stored PriorityEvaluation + its TriggeredReason rows.
 * `explanation` isn't a PriorityEvaluation column (see
 * packages/shared/src/schemas/priority.ts's comment) — it's rebuilt via
 * the engine's own `buildExplanation`, using the *historical*
 * RulesetConfig row matching `rulesetVersion` (config versions are
 * immutable and never deleted, so this always resolves to the exact
 * thresholds that produced the stored score).
 */
export async function reconstructEvaluationResult(
  client: Client,
  evaluation: StoredEvaluationRow,
  reasonRows: StoredReasonRow[],
): Promise<EvaluationResult> {
  const config = await client.rulesetConfig.findUnique({
    where: { version: evaluation.rulesetVersion },
  });

  const reasons: TriggeredReasonResult[] = [...reasonRows]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((r) => ({
      ruleId: r.ruleId ?? "",
      ruleCode: r.ruleCode,
      ruleName: r.ruleName,
      category: r.category,
      points: r.points,
      reasonText: r.reasonText,
      evidence: (r.evidenceJson ?? {}) as Record<string, unknown>,
      orderIndex: r.orderIndex,
    }));

  const priorityLevel = evaluation.priorityLevel as EvaluationResult["priorityLevel"];
  const explanation = config
    ? buildExplanation(reasons, evaluation.rawScore, evaluation.totalScore, priorityLevel, {
        version: config.version,
        highThreshold: config.highThreshold,
        mediumThreshold: config.mediumThreshold,
        maxScoreCap: config.maxScoreCap ?? undefined,
      })
    : // The historical config row is gone (should never happen — configs
      // are never deleted) — fall back to a best-effort reconstruction
      // rather than failing the whole read.
      buildExplanation(reasons, evaluation.rawScore, evaluation.totalScore, priorityLevel, {
        version: evaluation.rulesetVersion,
        highThreshold: 7,
        mediumThreshold: 3,
      });

  return {
    caseId: evaluation.caseId,
    rawScore: evaluation.rawScore,
    totalScore: evaluation.totalScore,
    priorityLevel,
    reasons,
    rulesetVersion: evaluation.rulesetVersion,
    engineVersion: evaluation.engineVersion,
    inputHash: evaluation.inputHash,
    evaluatedAtIso: evaluation.evaluatedAt.toISOString(),
    explanation,
  };
}
