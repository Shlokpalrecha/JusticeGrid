import { lockCaseWorkflow } from "./workflowLinks.js";
import { writeAuditEntry } from "./audit.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  evaluateCase,
  canonicalJson,
  DEFAULT_TEXT_RULES,
  type TextRule,
  type EvaluationResult,
  type Policy,
  type WorkflowInput,
  type ActionInput,
} from "@justicegrid/rules-engine";
import {
  AppError,
  PolicySchema,
  WorkflowFactsSchema,
  type EvaluationTrigger,
} from "@justicegrid/shared";
import { createNotification } from "./notifications.js";
type Client = PrismaClient | Prisma.TransactionClient;
export const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function loadActivePolicy(client: Client) {
  const row = await client.queuePolicy.findFirst({
    where: { isActive: true },
    include: { textRules: { include: { incoming: true }, orderBy: { position: "asc" } } },
  });
  if (!row)
    throw new AppError("INTERNAL_ERROR", "No active queue policy. Run the database migrations.");
  const config = PolicySchema.parse(row.config);
  const textRules: TextRule[] = row.textRules.length
    ? row.textRules.map((r) => ({
        id: r.ruleId,
        when: r.condition,
        ...(r.urgency ? { urgency: r.urgency as TextRule["urgency"] } : {}),
        ...(r.component
          ? { component: r.component as TextRule["component"], value: r.value! }
          : {}),
        dependsOn: r.incoming.map((d) => d.fromRuleId),
      }))
    : [...(config.textRules ?? DEFAULT_TEXT_RULES)];
  return { ...row, config: { ...config, textRules } };
}

export async function buildCaseEvaluationInput(
  client: Client,
  caseId: string,
  now: Date,
): Promise<WorkflowInput> {
  const c = await client.case.findUnique({
    where: { id: caseId },
    include: {
      ruleEvidence: true,
      workflowGraph: { include: { nodes: { orderBy: { key: "asc" } }, edges: true } },
      charges: { orderBy: { id: "asc" } },
      tasks: { orderBy: { id: "asc" } },
      documents: { orderBy: { id: "asc" } },
      hearings: { orderBy: { scheduledDate: "asc" } },
      workflowActions: { orderBy: { key: "asc" } },
    },
  });
  if (!c || c.deletedAt) throw new AppError("NOT_FOUND", "Case not found.");
  const facts = WorkflowFactsSchema.parse(c.workflowFacts);
  const ownerIds = [
    c.assignedToId,
    ...c.tasks.map((t) => t.assignedToId),
    ...c.workflowActions.flatMap((a) => {
      const p = a.payload as { ownerId?: string; ownerOverride?: string };
      return [p.ownerId, p.ownerOverride];
    }),
  ].filter((id): id is string => !!id);
  const owners = await client.user.findMany({
    where: {
      id: { in: [...new Set(ownerIds)] },
      isActive: true,
      deletedAt: null,
      role: { not: "AUDITOR" },
    },
    select: { id: true, role: true },
  });
  const accessibleOwners = new Set(
    owners.filter((u) => u.role === "ADMIN" || u.id === c.assignedToId).map((u) => u.id),
  );
  const activeOwner = (id: string | null | undefined) =>
    id && accessibleOwners.has(id) ? id : null;
  if (!Number.isFinite(now.getTime()))
    throw new AppError("VALIDATION_ERROR", "Invalid evaluation instant.");
  // Existing application data remains useful; it never establishes representation or legal eligibility.
  if (
    !facts.bailApplications.length &&
    c.bailAppliedDate &&
    ["APPLICATION_FILED", "HEARING_SCHEDULED"].includes(c.bailStatus)
  )
    facts.bailApplications.push({
      id: "recorded-application",
      filedAt: c.bailAppliedDate.toISOString(),
      type: "REGULAR",
      outcomeAt: null,
      interveningApplication: false,
      differentMandate: false,
      nextReviewAt: null,
    });
  const profileIds = [
    ...new Set(
      [
        facts.legalProfileId,
        ...facts.confirmedReviews.map((r) => r.profileId),
        ...c.workflowActions.map((a) => (a.payload as { profileId?: string }).profileId),
      ].filter((id): id is string => !!id),
    ),
  ];
  const profiles = await client.legalProfile.findMany({
    where: { id: { in: profileIds } },
    orderBy: { id: "asc" },
  });
  if (c.bailStatus === "GRANTED" && !facts.bailGrantedAt && !facts.releaseConfirmedAt)
    facts.communicationBlocked = true;
  return {
    ruleFacts: c.ruleEvidence
      ? {
          offenseSeverityIndex: c.ruleEvidence.offenseSeverityIndex,
          bailEligibility: c.ruleEvidence.bailEligibility,
        }
      : undefined,
    workflowGraph: c.workflowGraph
      ? {
          nodes: c.workflowGraph.nodes.map((n) => ({
            key: n.key,
            title: n.title,
            status: n.status,
            readyAt: n.readyAt?.toISOString() ?? null,
          })),
          edges: c.workflowGraph.edges.map((e) => ({ from: e.fromKey, to: e.toKey })),
        }
      : undefined,
    legalProfiles: profiles.map((p) => ({
      id: p.id,
      version: p.version,
      sourceId: p.sourceId,
      locator: p.locator,
      territory: p.territory,
      procedure: p.procedure,
      verificationNotes: p.verificationNotes,
    })),
    caseId: c.id,
    caseRef: c.caseRef,
    createdAt: c.createdAt.toISOString(),
    assignedToId: activeOwner(c.assignedToId),
    caseStatus: c.caseStatus,
    isArchived: c.isArchived,
    custodyType: c.custodyType,
    custodyStartDate: c.custodyStartDate?.toISOString() ?? null,
    courtName: c.courtName,
    chargeCount: c.charges.length,
    facts,
    bailStatus: c.bailStatus,
    charges: c.charges.map((ch) => ({
      id: ch.id,
      actName: ch.actName,
      sectionCode: ch.sectionCode,
      description: ch.description,
      isBailableFlag: ch.isBailableFlag,
    })),
    actions: c.workflowActions.map((a) => {
      const p = actionInput(a.payload);
      return {
        ...p,
        ownerId: activeOwner(p.ownerId),
        ...(p.ownerOverride !== undefined ? { ownerOverride: activeOwner(p.ownerOverride) } : {}),
        id: a.id,
        key: a.key,
        status: a.status as ActionInput["status"],
      };
    }),
    hearings: c.hearings.map((h) => ({
      id: h.id,
      scheduledAt: h.scheduledDate.toISOString(),
      actualAt: h.actualDate?.toISOString() ?? null,
      outcome: h.outcome,
      wasProduced: h.wasProduced,
      orderExpected: h.orderExpected || h.outcome === "ORDER_PASSED",
      orderReceivedAt: h.orderReceivedAt?.toISOString() ?? null,
      orderReviewed: h.orderReviewed,
      createdAt: h.createdAt.toISOString(),
    })),
    tasks: c.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.dueDate.toISOString(),
      ownerId: activeOwner(t.assignedToId),
      hearingId: t.hearingId,
      actionKey: t.actionKey,
      preparation: t.isPreparationTask,
      blocked: t.status === "BLOCKED",
      createdAt: t.createdAt.toISOString(),
    })),
    documents: c.documents.map((d) => ({
      id: d.id,
      name: d.documentType,
      status: d.status,
      mandatory: d.isMandatory,
      hearingId: d.hearingId,
      actionKey: d.actionKey,
      requestedAt: d.requestedAt?.toISOString() ?? null,
      receivedAt: d.receivedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export async function evaluateAndPersistCase(
  tx: Prisma.TransactionClient,
  caseId: string,
  options: {
    triggeredBy: EvaluationTrigger;
    triggeredById?: string | null;
    now?: Date;
    policy?: { config: Policy; version: number };
    notify?: boolean;
  },
): Promise<EvaluationResult> {
  await lockCaseWorkflow(tx, caseId);
  const now = options.now ?? new Date();
  const policy = options.policy ?? (await loadActivePolicy(tx));
  const input = await buildCaseEvaluationInput(tx, caseId, now);
  const result = evaluateCase(input, policy.config, now, policy.version);
  await tx.systemGeneration.upsert({
    where: { id: "queue" },
    create: { id: "queue", revision: 1 },
    update: { revision: { increment: 1 } },
  });
  const latest = await tx.queueEvaluation.findFirst({
    where: { caseId },
    orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }],
  });
  // Compare semantic output, not just facts. Clock-only transitions must be persisted.
  if (!latest || latest.outcomeHash !== result.outcomeHash) {
    await tx.queueEvaluation.create({
      data: {
        caseId,
        policyVersion: policy.version,
        inputSnapshot: toJson(input),
        policySnapshot: toJson(policy.config),
        result: toJson(result),
        outcomeHash: result.outcomeHash,
        evaluatedAt: now,
        triggeredBy: options.triggeredBy,
        triggeredById: options.triggeredById ?? null,
      },
    });
    const actor = options.triggeredById
      ? await tx.user.findUnique({
          where: { id: options.triggeredById },
          select: { id: true, email: true, role: true },
        })
      : null;
    await writeAuditEntry(
      tx,
      actor ?? { id: null, email: "system@justicegrid.local", role: null },
      { ipAddress: null, userAgent: null, requestId: `evaluation:${caseId}:${now.toISOString()}` },
      {
        action: "UPDATE",
        entityType: "QueueEvaluation",
        entityId: caseId,
        entityLabel: input.caseRef,
        summary: `${options.triggeredBy} queue state transition (policy ${policy.version})`,
        before: latest?.result ?? null,
        after: result,
      },
    );
  }
  for (const action of result.actions) {
    const old = input.actions.find((a) => a.key === action.key);
    if (!old)
      await tx.workflowAction.create({
        data: {
          id: action.id,
          caseId,
          key: action.key,
          type: action.type,
          status: action.status,
          generated: action.id.startsWith("auto:"),
          payload: toJson(actionInput(action)),
        },
      });
    else if (canonicalJson(old) !== canonicalJson(actionInput(action)))
      await tx.workflowAction.update({
        where: { id: action.id },
        data: { payload: toJson(actionInput(action)) },
      });
    if (options.notify !== false && ["U0", "U1"].includes(action.urgency)) {
      const recipients = action.ownerId
        ? [action.ownerId]
        : (
            await tx.user.findMany({
              where: { role: "ADMIN", isActive: true, deletedAt: null },
              select: { id: true },
            })
          ).map((u) => u.id);
      const stage = `${action.urgency}:${action.dueAt && new Date(action.dueAt) <= now ? "DUE" : "APPROACHING"}:${action.status}`;
      for (const userId of recipients) {
        const created = await tx.actionNotification.createMany({
          data: [
            { episodeKey: `${caseId}:${action.key}:${action.dueAt ?? "no-date"}`, userId, stage },
          ],
          skipDuplicates: true,
        });
        if (created.count)
          await createNotification(tx, {
            userId,
            type: "PRIORITY_ESCALATED",
            title: `${action.urgency}: ${action.title}`,
            body: `${input.caseRef}: ${action.evidence}`,
            relatedEntityType: "Case",
            relatedEntityId: caseId,
          });
      }
    }
  }
  const activeKeys = new Set(result.actions.map((a) => a.key));
  for (const a of input.actions.filter(
    (a) =>
      a.id.startsWith("auto:") &&
      !activeKeys.has(a.key) &&
      !["RESOLVED", "CANCELLED"].includes(a.status),
  )) {
    await tx.workflowAction.update({
      where: { id: a.id },
      data: {
        status: "RESOLVED",
        revision: { increment: 1 },
        payload: toJson({
          ...a,
          status: "RESOLVED",
          resolvedAt: now.toISOString(),
          resolutionEvidence:
            "Source condition no longer present; prior facts/evaluation retained.",
        }),
      },
    });
  }
  const lastHearing = input.hearings
    .filter(
      (h) =>
        Date.parse(h.actualAt ?? h.scheduledAt) <= now.getTime() &&
        !["PENDING", "CANCELLED"].includes(h.outcome),
    )
    .sort(
      (a, b) => Date.parse(b.actualAt ?? b.scheduledAt) - Date.parse(a.actualAt ?? a.scheduledAt),
    )[0];
  await tx.case.update({
    where: { id: caseId },
    data: {
      currentPriorityLevel: result.included ? result.priorityLevel : null,
      currentPriorityScore: result.included ? result.supportScore : null,
      lastEvaluatedAt: now,
      queueNextEvaluationAt: new Date(result.nextEvaluationAt),
      queueDeadline:
        result.selectedAction?.orderingDeadline || result.plannedReviewAt
          ? new Date(result.selectedAction?.orderingDeadline ?? result.plannedReviewAt!)
          : null,
      queueActivatedAt: result.selectedAction ? new Date(result.selectedAction.activatedAt) : null,
      queueError: null,
      nextHearingDate: result.nextHearingAt ? new Date(result.nextHearingAt) : null,
      lastHearingDate: lastHearing
        ? new Date(lastHearing.actualAt ?? lastHearing.scheduledAt)
        : null,
    },
  });
  return result;
}

/** Persist facts only; derived scores must never feed the next evaluation. */
export function actionInput(value: unknown): ActionInput {
  const {
    ruleTrace: _trace,
    urgency: _u,
    originalUrgency: _o,
    orderingDeadline: _d,
    supportScore: _s,
    components: _c,
    explanation: _e,
    warnings: _w,
    suppressedDuplicates: _n,
    ...input
  } = value as ActionInput & Record<string, unknown>;
  return input as ActionInput;
}
