import type { Prisma } from "@prisma/client";
import {
  compileRules,
  DEFAULT_TEXT_RULES,
  RULE_FIELDS,
  GraphError,
  ACTION_CATALOG,
  SOURCES,
  buildQueue,
  evaluateCase,
  type Policy,
  type Urgency,
} from "@justicegrid/rules-engine";
import { AppError, PolicySchema } from "@justicegrid/shared";
import { type AuditRequestContext, writeAuditEntry } from "../../lib/audit.js";
import {
  buildCaseEvaluationInput,
  evaluateAndPersistCase,
  loadActivePolicy,
  toJson,
} from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";
import { type QueueActor, scope } from "../priority/priority.service.js";
function validateProgram(config: Policy) {
  try {
    compileRules(config.textRules ?? DEFAULT_TEXT_RULES);
  } catch (error) {
    throw new AppError(
      error instanceof GraphError && error.code === "CYCLE_DETECTED"
        ? "CYCLE_DETECTED"
        : "RULE_PARSE_ERROR",
      error instanceof Error ? error.message : "Invalid rule program",
    );
  }
}
function admin(actor: QueueActor) {
  if (actor.role !== "ADMIN")
    throw new AppError("FORBIDDEN", "Only administrators can publish queue policy.");
}
export async function getPolicy() {
  const active = await loadActivePolicy(prisma);
  const history = await prisma.queuePolicy.findMany({ orderBy: { version: "desc" } });
  const profiles = await prisma.legalProfile.findMany({
    orderBy: [{ name: "asc" }, { version: "desc" }],
  });
  return {
    active: {
      ...active,
      config: { ...active.config, textRules: active.config.textRules ?? DEFAULT_TEXT_RULES },
    },
    ruleFields: RULE_FIELDS,
    history,
    profiles,
    sources: SOURCES,
    catalog: ACTION_CATALOG,
    calculatorMode: "CONFIRMED_DATES_ONLY" as const,
  };
}
export async function simulatePolicy(actor: QueueActor, config: Policy) {
  admin(actor);
  PolicySchema.parse(config);
  validateProgram(config);
  return prisma.$transaction(
    async (tx) => {
      const current = await loadActivePolicy(tx),
        now = new Date();
      const cases = await tx.case.findMany({ where: scope(actor), select: { id: true } });
      const inputs = await Promise.all(cases.map((c) => buildCaseEvaluationInput(tx, c.id, now)));
      const before = buildQueue(
        inputs.map((i) => evaluateCase(i, current.config, now, current.version)),
      );
      const after = buildQueue(
        inputs.map((i) => evaluateCase(i, config, now, current.version + 1)),
      );
      return {
        evaluatedAt: now.toISOString(),
        before,
        after,
        changed: after
          .map((r, rank) => ({
            caseId: r.caseId,
            caseRef: r.caseRef,
            beforeRank: before.findIndex((x) => x.caseId === r.caseId) + 1,
            afterRank: rank + 1,
            beforeUrgency: before.find((x) => x.caseId === r.caseId)?.priorityLevel,
            afterUrgency: r.priorityLevel,
            beforeSupport: before.find((x) => x.caseId === r.caseId)?.supportScore,
            afterSupport: r.supportScore,
          }))
          .filter(
            (r) =>
              r.beforeRank !== r.afterRank ||
              r.beforeUrgency !== r.afterUrgency ||
              r.beforeSupport !== r.afterSupport,
          ),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 120_000 },
  );
}
export async function publishPolicy(
  actor: QueueActor,
  config: Policy,
  expectedVersion: number,
  reason: string,
  request: AuditRequestContext,
) {
  admin(actor);
  PolicySchema.parse(config);
  validateProgram(config);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('queue-policy-publication'))`;
      const current = await loadActivePolicy(tx);
      if (current.version !== expectedVersion)
        throw new AppError("CONFLICT", "Policy changed. Reload and simulate again.");
      const version = current.version + 1,
        now = new Date();
      await tx.queuePolicy.update({ where: { id: current.id }, data: { isActive: false } });
      const next = await tx.queuePolicy.create({
        data: {
          version,
          config: toJson({ ...config, textRules: undefined }),
          isActive: true,
          createdById: actor.id,
          changeReason: reason,
        },
      });
      const definitions = config.textRules ?? DEFAULT_TEXT_RULES;
      await tx.runtimeTextRule.createMany({
        data: definitions.map((r, position) => ({
          policyId: next.id,
          ruleId: r.id,
          position,
          condition: r.when,
          urgency: r.urgency ?? null,
          component: r.component ?? null,
          value: r.value ?? null,
        })),
      });
      const dependencies = definitions.flatMap((r) =>
        (r.dependsOn ?? []).map((fromRuleId) => ({
          policyId: next.id,
          fromRuleId,
          toRuleId: r.id,
        })),
      );
      if (dependencies.length) await tx.runtimeRuleDependency.createMany({ data: dependencies });
      const cases = await tx.case.findMany({ where: { deletedAt: null }, select: { id: true } });
      for (const c of cases)
        await evaluateAndPersistCase(tx, c.id, {
          triggeredBy: "RULE_CHANGE",
          triggeredById: actor.id,
          now,
          policy: { config, version },
          notify: false,
        });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "QueuePolicy",
        entityId: next.id,
        entityLabel: `Policy v${version}`,
        summary: reason,
        before: { version: current.version, config: current.config },
        after: { version, config },
      });
      return next;
    },
    { timeout: 120_000, isolationLevel: "Serializable" },
  );
}
export async function rollbackPolicy(
  actor: QueueActor,
  version: number,
  expectedVersion: number,
  reason: string,
  request: AuditRequestContext,
) {
  admin(actor);
  const previous = await prisma.queuePolicy.findUnique({
    where: { version },
    include: { textRules: { include: { incoming: true }, orderBy: { position: "asc" } } },
  });
  if (!previous) throw new AppError("NOT_FOUND", "Historical policy not found.");
  return publishPolicy(
    actor,
    {
      ...PolicySchema.parse(previous.config),
      ...(previous.textRules.length
        ? {
            textRules: previous.textRules.map((r) => ({
              id: r.ruleId,
              when: r.condition,
              ...(r.urgency ? { urgency: r.urgency as Urgency } : {}),
              ...(r.component
                ? { component: r.component as "H" | "A" | "B" | "D" | "F", value: r.value! }
                : {}),
              dependsOn: r.incoming.map((d) => d.fromRuleId),
            })),
          }
        : {}),
    },
    expectedVersion,
    `Rollback to configuration v${version}: ${reason}`,
    request,
  );
}
export async function createProfile(
  actor: QueueActor,
  input: Omit<
    Prisma.LegalProfileUncheckedCreateInput,
    "id" | "createdAt" | "mode" | "verifiedById"
  >,
  request: AuditRequestContext,
) {
  admin(actor);
  if (
    new Date(input.verifiedAt) > new Date() ||
    input.sourceId === "TEAM" ||
    new Date(input.effectiveFrom) > new Date(input.verifiedAt)
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Profile requires an existing legal/procedural source and a past verification date.",
    );
  return prisma.$transaction(async (tx) => {
    const latest = await tx.legalProfile.findFirst({
      where: { name: input.name },
      orderBy: { version: "desc" },
    });
    if (
      input.version !== (latest?.version ?? 0) + 1 ||
      (input.supersedesId ?? null) !== (latest?.id ?? null)
    )
      throw new AppError(
        "CONFLICT",
        "Profiles are immutable and must supersede the latest version.",
      );
    const row = await tx.legalProfile.create({
      data: { ...input, verifiedById: actor.id, mode: "CONFIRMED_DATES_ONLY" },
    });
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "LegalProfile",
      entityId: row.id,
      entityLabel: row.name,
      summary:
        "Recorded source applicability review; automatic entitlement calculations remain disabled",
      after: row,
    });
    return row;
  });
}
