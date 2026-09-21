import type { Prisma, Rule, RulesetConfig } from "@prisma/client";
import {
  evaluateCase,
  type RuleDefinition,
  type RulesetConfig as EngineRulesetConfig,
} from "@justicegrid/rules-engine";
import {
  AppError,
  type RuleCreateInput,
  type RuleDto,
  type RuleSimulateInput,
  type RuleSimulateResponse,
  type RuleToggleInput,
  type RuleUpdateInput,
  type RuleVersionDto,
  type RulesetConfigCreateInput,
  type RulesetConfigDto,
} from "@justicegrid/shared";
import type { AuditActor, AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import {
  buildCaseEvaluationInput,
  evaluateAndPersistCase,
  loadActiveRulesetConfig,
  loadRuleDefinitions,
  toRuleDefinition,
} from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";

/** Rules routes all require CONFIGURE_RULES (ADMIN-only, spec §8.3), so
 * unlike `lib/audit.ts`'s `AuditActor` (whose `id` is nullable to allow
 * system-initiated entries), the actor here is always a real
 * authenticated user — `id` stays a plain `string`, matching
 * `req.user` (middleware/auth.ts's `AuthenticatedUser`), avoiding a cast
 * at every call site. It's still structurally assignable wherever an
 * `AuditActor` is expected. */
interface ActorContext {
  id: string;
  email: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

export function toRuleDto(rule: Rule): RuleDto {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    description: rule.description,
    category: rule.category,
    conditionType: rule.conditionType,
    params: rule.params as RuleDto["params"],
    weight: rule.weight,
    isEnabled: rule.isEnabled,
    displayTemplate: rule.displayTemplate,
    severityHint: rule.severityHint,
    version: rule.version,
    createdById: rule.createdById,
    updatedById: rule.updatedById,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export function toRulesetConfigDto(config: RulesetConfig): RulesetConfigDto {
  return {
    id: config.id,
    version: config.version,
    highThreshold: config.highThreshold,
    mediumThreshold: config.mediumThreshold,
    maxScoreCap: config.maxScoreCap,
    isActive: config.isActive,
    activatedAt: config.activatedAt.toISOString(),
    activatedById: config.activatedById,
    notes: config.notes,
  };
}

export async function listRules(): Promise<RuleDto[]> {
  const rules = await prisma.rule.findMany({ orderBy: { code: "asc" } });
  return rules.map(toRuleDto);
}

export async function getRuleVersions(ruleId: string): Promise<RuleVersionDto[]> {
  const versions = await prisma.ruleVersion.findMany({
    where: { ruleId },
    orderBy: { version: "desc" },
  });
  return versions.map((v) => ({
    id: v.id,
    ruleId: v.ruleId,
    version: v.version,
    snapshotJson: v.snapshotJson,
    changedById: v.changedById,
    changeReason: v.changeReason,
    changedAt: v.changedAt.toISOString(),
  }));
}

function ruleSnapshot(rule: Rule): Record<string, unknown> {
  return {
    code: rule.code,
    name: rule.name,
    description: rule.description,
    category: rule.category,
    conditionType: rule.conditionType,
    params: rule.params,
    weight: rule.weight,
    isEnabled: rule.isEnabled,
    displayTemplate: rule.displayTemplate,
    severityHint: rule.severityHint,
    version: rule.version,
  };
}

export async function createRule(
  actor: ActorContext,
  input: RuleCreateInput,
  request: AuditRequestContext,
): Promise<RuleDto> {
  const rule = await prisma.$transaction(async (tx) => {
    const r = await tx.rule.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        category: input.category,
        conditionType: input.conditionType,
        params: input.params,
        weight: input.weight,
        isEnabled: input.isEnabled,
        displayTemplate: input.displayTemplate,
        severityHint: input.severityHint,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await tx.ruleVersion.create({
      data: {
        ruleId: r.id,
        version: r.version,
        snapshotJson: ruleSnapshot(r) as Prisma.InputJsonValue,
        changedById: actor.id,
        changeReason: "Rule created",
      },
    });
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "Rule",
      entityId: r.id,
      entityLabel: r.code,
      summary: `${actor.email} created rule ${r.code}`,
      after: ruleSnapshot(r),
    });
    return r;
  });

  return toRuleDto(rule);
}

export async function updateRule(
  actor: ActorContext,
  ruleId: string,
  input: RuleUpdateInput,
  request: AuditRequestContext,
): Promise<RuleDto> {
  const existing = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!existing) throw new AppError("NOT_FOUND", "Rule not found.");

  const weightChanged = input.weight !== undefined && input.weight !== existing.weight;

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.rule.update({
      where: { id: ruleId },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        conditionType: input.conditionType,
        params: input.params,
        weight: input.weight,
        isEnabled: input.isEnabled,
        displayTemplate: input.displayTemplate,
        severityHint: input.severityHint,
        updatedById: actor.id,
        version: { increment: 1 },
      },
    });
    await tx.ruleVersion.create({
      data: {
        ruleId: r.id,
        version: r.version,
        snapshotJson: ruleSnapshot(r) as Prisma.InputJsonValue,
        changedById: actor.id,
        changeReason: input.changeReason ?? "Rule updated",
      },
    });
    await writeAuditEntry(tx, actor, request, {
      action: weightChanged ? "RULE_WEIGHT_CHANGE" : "UPDATE",
      entityType: "Rule",
      entityId: r.id,
      entityLabel: r.code,
      summary: weightChanged
        ? `${actor.email} changed rule ${r.code}'s weight from ${existing.weight} to ${r.weight}`
        : `${actor.email} updated rule ${r.code}`,
      before: ruleSnapshot(existing),
      after: ruleSnapshot(r),
    });
    return r;
  });

  await recomputeAllCases(actor, request, "RULE_CHANGE");
  return toRuleDto(updated);
}

export async function toggleRule(
  actor: ActorContext,
  ruleId: string,
  input: RuleToggleInput,
  request: AuditRequestContext,
): Promise<RuleDto> {
  const existing = await prisma.rule.findUnique({ where: { id: ruleId } });
  if (!existing) throw new AppError("NOT_FOUND", "Rule not found.");

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.rule.update({
      where: { id: ruleId },
      data: { isEnabled: input.isEnabled, updatedById: actor.id, version: { increment: 1 } },
    });
    await tx.ruleVersion.create({
      data: {
        ruleId: r.id,
        version: r.version,
        snapshotJson: ruleSnapshot(r) as Prisma.InputJsonValue,
        changedById: actor.id,
        changeReason: input.changeReason ?? (input.isEnabled ? "Rule enabled" : "Rule disabled"),
      },
    });
    await writeAuditEntry(tx, actor, request, {
      action: "RULE_TOGGLE",
      entityType: "Rule",
      entityId: r.id,
      entityLabel: r.code,
      summary: `${actor.email} ${input.isEnabled ? "enabled" : "disabled"} rule ${r.code}`,
      before: { isEnabled: existing.isEnabled },
      after: { isEnabled: r.isEnabled },
    });
    return r;
  });

  await recomputeAllCases(actor, request, "RULE_CHANGE");
  return toRuleDto(updated);
}

export async function getRulesetConfig(): Promise<RulesetConfigDto> {
  const config = await prisma.rulesetConfig.findFirst({ where: { isActive: true } });
  if (!config) throw new AppError("NOT_FOUND", "No active ruleset configuration exists.");
  return toRulesetConfigDto(config);
}

/** `PUT /rules/config` (spec §7): thresholds are versioned, never
 * mutated in place (spec §5's RulesetConfig comment) — this always
 * creates a new active row and deactivates the previous one. */
export async function updateRulesetConfig(
  actor: ActorContext,
  input: RulesetConfigCreateInput,
  request: AuditRequestContext,
): Promise<RulesetConfigDto> {
  const previous = await prisma.rulesetConfig.findFirst({ where: { isActive: true } });

  const created = await prisma.$transaction(async (tx) => {
    if (previous) {
      await tx.rulesetConfig.update({ where: { id: previous.id }, data: { isActive: false } });
    }
    const config = await tx.rulesetConfig.create({
      data: {
        version: (previous?.version ?? 0) + 1,
        highThreshold: input.highThreshold,
        mediumThreshold: input.mediumThreshold,
        maxScoreCap: input.maxScoreCap,
        isActive: true,
        activatedById: actor.id,
        notes: input.notes,
      },
    });
    await writeAuditEntry(tx, actor, request, {
      action: "THRESHOLD_CHANGE",
      entityType: "RulesetConfig",
      entityId: config.id,
      entityLabel: `RulesetConfig v${config.version}`,
      summary: `${actor.email} activated ruleset config v${config.version} (high=${config.highThreshold}, medium=${config.mediumThreshold})`,
      before: previous ? toRulesetConfigDto(previous) : null,
      after: toRulesetConfigDto(config),
    });
    return config;
  });

  await recomputeAllCases(actor, request, "RULE_CHANGE");
  return toRulesetConfigDto(created);
}

/** Re-evaluates every non-deleted case and logs one `PRIORITY_RECOMPUTE`
 * audit entry summarizing the run (spec §6.7). Each case's evaluation
 * runs in its own transaction — a failure partway through still leaves
 * every case evaluated so far durably updated, rather than rolling back
 * the whole batch. */
/**
 * `actor` is `AuditActor` (nullable `id`/`role`), not the narrower
 * `ActorContext`, so the nightly scheduled job (jobs/nightlyRecompute.ts)
 * can call this with a system actor (`id: null`) — spec §6.7's
 * SCHEDULED trigger has no authenticated user behind it. Every
 * HTTP-triggered call site still passes a real `ActorContext`, which is
 * structurally an `AuditActor` (its `id`/`role` are non-null subtypes).
 */
export async function recomputeAllCases(
  actor: AuditActor,
  request: AuditRequestContext,
  triggeredBy: "USER" | "SCHEDULED" | "RULE_CHANGE",
): Promise<{ recomputedCount: number }> {
  const caseIds = (
    await prisma.case.findMany({ where: { deletedAt: null }, select: { id: true } })
  ).map((c) => c.id);

  for (const caseId of caseIds) {
    await prisma.$transaction((tx) =>
      evaluateAndPersistCase(tx, caseId, { triggeredBy, triggeredById: actor.id }),
    );
  }

  await prisma.$transaction((tx) =>
    writeAuditEntry(tx, actor, request, {
      action: "PRIORITY_RECOMPUTE",
      entityType: "System",
      entityLabel: "All cases",
      summary: `${actor.email} triggered a recompute of ${caseIds.length} case(s)`,
      after: { recomputedCount: caseIds.length, triggeredBy },
    }),
  );

  return { recomputedCount: caseIds.length };
}

function applyRuleOverrides(rules: RuleDefinition[], input: RuleSimulateInput): RuleDefinition[] {
  const overridesById = new Map(input.ruleOverrides.map((o) => [o.ruleId, o]));
  return rules.map((rule) => {
    const override = overridesById.get(rule.id);
    if (!override) return rule;
    return {
      ...rule,
      weight: override.weight ?? rule.weight,
      isEnabled: override.isEnabled ?? rule.isEnabled,
    };
  });
}

function applyConfigOverrides(
  config: EngineRulesetConfig,
  input: RuleSimulateInput,
): EngineRulesetConfig {
  return {
    version: config.version,
    highThreshold: input.highThreshold ?? config.highThreshold,
    mediumThreshold: input.mediumThreshold ?? config.mediumThreshold,
    maxScoreCap: input.maxScoreCap ?? config.maxScoreCap,
  };
}

/** `POST /rules/simulate` (spec §7 ⭐): evaluates every case against both
 * the current ruleset and a candidate one, WITHOUT persisting anything —
 * neither a PriorityEvaluation row nor a Case field is touched. */
export async function simulateRuleset(input: RuleSimulateInput): Promise<RuleSimulateResponse> {
  const [currentRules, { engine: currentConfig }, caseIds] = await Promise.all([
    loadRuleDefinitions(prisma),
    loadActiveRulesetConfig(prisma),
    prisma.case.findMany({ where: { deletedAt: null }, select: { id: true, caseRef: true } }),
  ]);

  const candidateRules = applyRuleOverrides(currentRules, input);
  const candidateConfig = applyConfigOverrides(currentConfig, input);

  const now = new Date();
  const beforeResults: {
    caseId: string;
    caseRef: string;
    totalScore: number;
    priorityLevel: string;
  }[] = [];
  const afterResults: typeof beforeResults = [];

  for (const { id: caseId, caseRef } of caseIds) {
    const evalInput = await buildCaseEvaluationInput(prisma, caseId);
    const before = evaluateCase(evalInput, currentRules, currentConfig, now);
    const after = evaluateCase(evalInput, candidateRules, candidateConfig, now);
    beforeResults.push({
      caseId,
      caseRef,
      totalScore: before.totalScore,
      priorityLevel: before.priorityLevel,
    });
    afterResults.push({
      caseId,
      caseRef,
      totalScore: after.totalScore,
      priorityLevel: after.priorityLevel,
    });
  }

  function distributionOf(results: typeof beforeResults) {
    return {
      ROUTINE: results.filter((r) => r.priorityLevel === "ROUTINE").length,
      MEDIUM: results.filter((r) => r.priorityLevel === "MEDIUM").length,
      HIGH: results.filter((r) => r.priorityLevel === "HIGH").length,
    };
  }

  function topN(results: typeof beforeResults) {
    return [...results]
      .sort((a, b) => b.totalScore - a.totalScore || (a.caseRef < b.caseRef ? -1 : 1))
      .slice(0, input.topN)
      .map((r) => ({
        caseId: r.caseId,
        caseRef: r.caseRef,
        totalScore: r.totalScore,
        priorityLevel:
          r.priorityLevel as RuleSimulateResponse["before"]["topCases"][number]["priorityLevel"],
      }));
  }

  return {
    before: { distribution: distributionOf(beforeResults), topCases: topN(beforeResults) },
    after: { distribution: distributionOf(afterResults), topCases: topN(afterResults) },
    casesEvaluated: caseIds.length,
  };
}

// Re-exported so callers (priority module) can reference the same
// mapper this module uses, without a second, possibly-drifting copy.
export { toRuleDefinition };
