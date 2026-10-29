import { compileRules, runRules, DEFAULT_TEXT_RULES } from "./systems/rules.js";
import { analyzeDag } from "./systems/graph.js";
import { deriveActions } from "./actions.js";
import { calendarDays, instant } from "./clocks.js";
import { canonicalJson, sha256Hex } from "./hash.js";
import { DEFAULT_POLICY, ENGINE_VERSION, validatePolicy } from "./policy.js";
import type {
  ActionInput,
  ActionResult,
  EvaluationResult,
  Policy,
  Urgency,
  WorkflowInput,
} from "./workflowTypes.js";
const RANK: Record<Urgency, number> = { U0: 0, U1: 1, U2: 2, U3: 3 };
const labels = {
  U0: "Immediate attention",
  U1: "Time-sensitive review",
  U2: "Follow-up needed",
  U3: "Scheduled/routine",
};
export const urgencyLabel = (level: Urgency): string => labels[level];
const textCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function compareActions(a: ActionResult, b: ActionResult): number {
  return (
    RANK[a.urgency] - RANK[b.urgency] ||
    (a.orderingDeadline === null
      ? b.orderingDeadline === null
        ? 0
        : 1
      : b.orderingDeadline === null
        ? -1
        : instant(a.orderingDeadline) - instant(b.orderingDeadline)) ||
    b.supportScore - a.supportScore ||
    instant(a.activatedAt) - instant(b.activatedAt) ||
    textCompare(a.key, b.key) ||
    textCompare(a.id, b.id)
  );
}
export function compareEvaluations(a: EvaluationResult, b: EvaluationResult): number {
  const key = (r: EvaluationResult) => r.selectedAction;
  const x = key(a),
    y = key(b);
  const due = (r: EvaluationResult) => r.selectedAction?.orderingDeadline ?? r.plannedReviewAt;
  const ad = due(a),
    bd = due(b);
  return (
    RANK[a.priorityLevel] - RANK[b.priorityLevel] ||
    (ad === null ? (bd === null ? 0 : 1) : bd === null ? -1 : instant(ad) - instant(bd)) ||
    b.supportScore - a.supportScore ||
    (x ? instant(x.activatedAt) : 0) - (y ? instant(y.activatedAt) : 0) ||
    textCompare(a.caseRef, b.caseRef) ||
    textCompare(a.caseId, b.caseId)
  );
}
export function buildQueue(results: EvaluationResult[]): EvaluationResult[] {
  return results
    .filter((r) => r.included)
    .slice()
    .sort(compareEvaluations);
}

export function evaluateCase(
  input: WorkflowInput,
  policy: Policy = DEFAULT_POLICY,
  now: Date,
  policyVersion = 1,
): EvaluationResult {
  validatePolicy(policy);
  const at = now.toISOString(),
    ms = now.getTime(),
    warnings: string[] = [];
  const program = compileRules(policy.textRules ?? DEFAULT_TEXT_RULES);
  const candidates = deriveActions(input, at);
  if (
    input.workflowGraph &&
    !input.isArchived &&
    !["CLOSED", "DISPOSED", "TRANSFERRED"].includes(input.caseStatus)
  ) {
    const graph = input.workflowGraph,
      analysis = analyzeDag(
        graph.nodes.map((n) => n.key),
        graph.edges,
        new Set(graph.nodes.filter((n) => n.status === "DONE").map((n) => n.key)),
      );
    for (const key of analysis.ready) {
      const node = graph.nodes.find((n) => n.key === key)!;
      candidates.push({
        id: `auto:${input.caseId}:dag:${key}`,
        key: `dag:${key}`,
        sourceKey: `dag:${key}`,
        type: "A16",
        title: `Workflow ready: ${node.title}`,
        status: "OPEN",
        activatedAt: node.readyAt ?? input.createdAt,
        dueAt: input.facts.nextPlannedReviewAt,
        origin: "TEAM_TARGET",
        confidence: "CONFIRMED",
        sourceId: "TEAM",
        locator: "Configured workflow DAG",
        evidence: `All prerequisites completed: ${analysis.predecessors[key]!.join(", ") || "entry task"}. Human completion evidence required.`,
        ownerId: input.assignedToId,
        critical: false,
        forthwith: false,
        retainedAfterClosure: false,
        parentKey: null,
        hearingId: null,
        blocker: "NONE",
        criticalDataMissing: false,
        ordinaryDataMissing: false,
        acknowledgedAt: null,
        resolvedAt: null,
        resolutionEvidence: null,
        override: null,
        nextReviewAt: null,
      });
    }
  }
  const merged = candidates
    .map((a): ActionInput => {
      const history = input.actions.filter((old) => (old.sourceKey ?? old.key) === a.key);
      const old = history.find((old) => !["RESOLVED", "CANCELLED"].includes(old.status));
      if (old)
        return {
          ...a,
          sourceKey: a.key,
          key: old.key,
          id: old.id,
          activatedAt: old.activatedAt,
          status:
            a.type === "A01" && old.status !== "BLOCKED"
              ? a.status
              : old.status === "OPEN"
                ? a.status
                : old.status,
          ownerId: old.ownerOverride !== undefined ? old.ownerOverride : a.ownerId,
          ownerOverride: old.ownerOverride,
          acknowledgedAt:
            a.type === "A01" ? a.acknowledgedAt : (old.acknowledgedAt ?? a.acknowledgedAt),
          nextReviewAt: a.type === "A01" ? (a.nextReviewAt ?? null) : (old.nextReviewAt ?? null),
          resolutionEvidence: old.resolutionEvidence,
          override: old.override,
        };
      const manuallyClosed = history.find(
        (old) =>
          ["RESOLVED", "CANCELLED"].includes(old.status) &&
          !old.resolutionEvidence?.startsWith("Source condition no longer"),
      );
      if (manuallyClosed) return { ...a, ...manuallyClosed };
      const key = history.length ? `${a.key}:episode:${history.length + 1}` : a.key;
      return {
        ...a,
        sourceKey: a.key,
        key,
        id: `auto:${input.caseId}:${key}`,
        ...(history.length ? { activatedAt: at } : {}),
      };
    })
    .concat(input.actions.filter((a) => !a.id.startsWith("auto:")));
  const unique = new Map<string, ActionInput>();
  const duplicateCount = new Map<string, number>();
  for (const a of merged.slice().sort((a, b) => textCompare(a.id, b.id))) {
    if (unique.has(a.key)) {
      duplicateCount.set(a.key, (duplicateCount.get(a.key) ?? 0) + 1);
      continue;
    }
    unique.set(a.key, a);
  }
  const inactive =
    input.isArchived || ["DISPOSED", "CLOSED", "TRANSFERRED"].includes(input.caseStatus);
  function score(a: ActionInput): ActionResult {
    const hours = a.dueAt ? (instant(a.dueAt) - ms) / 3_600_000 : Infinity;
    let urgency: Urgency = "U3";
    const immediate = a.type === "A01" && !a.acknowledgedAt;
    const critical =
      a.critical &&
      a.confidence === "CONFIRMED" &&
      ["STATUTE", "COURT_ORDER"].includes(a.origin) &&
      !!a.evidence &&
      !!a.locator;
    const h = input.hearings.find((h) => h.id === a.hearingId),
      days = h ? calendarDays(at, h.scheduledAt) : Number.MAX_SAFE_INTEGER,
      w = policy.weights;
    const ranked = runRules(program, {
      Type: a.type,
      Origin: a.origin,
      Confidence: a.confidence,
      Blocker: a.blocker,
      Status: a.status,
      Representation: input.facts.representation,
      Immediate: immediate,
      Critical: critical,
      Forthwith: a.forthwith,
      Critical_Data_Missing: a.criticalDataMissing,
      Ordinary_Data_Missing: a.ordinaryDataMissing,
      Has_Owner: !!a.ownerId,
      Counsel_Accepted: !!input.facts.counselAcceptedAt,
      Communication_Blocked: input.facts.communicationBlocked,
      Interpreter_Needed: input.facts.interpreterNeeded,
      Attendance_Unconfirmed: !!h && input.facts.attendanceUnconfirmedHearingIds.includes(h.id),
      Nonproduction: a.type === "A11" && (a.sourceKey ?? a.key).startsWith("production:"),
      Hours_To_Deadline: Number.isFinite(hours) ? hours : Number.MAX_SAFE_INTEGER,
      Hearing_Days: days,
      Waiting_Days: calendarDays(a.activatedAt, at),
      Immediate_Hours: policy.immediateHours,
      Sensitive_Hours: policy.sensitiveHours,
      Routine_Days: policy.routineDays,
      Hearing_Near_Days: policy.hearingNearDays,
      Hearing_Week_Days: policy.hearingWeekDays,
      Aging_Step_Days: policy.agingStepDays,
      Weight_Hearing_Near: w.hearingNear,
      Weight_Hearing_Week: w.hearingWeek,
      Weight_Attendance: w.attendance,
      Weight_Access: w.access,
      Weight_Communication: w.communication,
      Weight_Blocker: w.blocker,
      Weight_Ordinary_Blocker: w.ordinaryBlocker,
      Weight_Critical_Data: w.criticalData,
      Weight_Ordinary_Data: w.ordinaryData,
      Weight_Aging: w.aging,
      Statutory_Deadline_Days: critical && Number.isFinite(hours) ? hours / 24 : null,
      Offense_Severity_Index: input.ruleFacts?.offenseSeverityIndex ?? null,
      Bail_Eligibility: input.ruleFacts?.bailEligibility ?? null,
    });
    urgency = ranked.urgency;
    // Non-configurable safety invariants, distinct from configurable prioritization policy.
    const protectedRank = runRules(compileRules(DEFAULT_TEXT_RULES.slice(0, 2)), {
      Immediate: immediate,
      Critical: critical,
      Forthwith: a.forthwith,
      Hours_To_Deadline: Number.isFinite(hours) ? hours : Number.MAX_SAFE_INTEGER,
      Immediate_Hours: policy.immediateHours,
      Sensitive_Hours: policy.sensitiveHours,
      Type: a.type,
      Origin: a.origin,
      Critical_Data_Missing: a.criticalDataMissing,
      Nonproduction: a.type === "A11" && (a.sourceKey ?? a.key).startsWith("production:"),
    }).urgency;
    if (RANK[protectedRank] < RANK[urgency]) urgency = protectedRank;
    if (urgency === "U0" && !immediate && !critical) urgency = "U1";
    const originalUrgency = urgency;
    const actionWarnings: string[] = [];
    if (a.override && instant(a.override.expiresAt) > ms) {
      if (RANK[a.override.urgency] > RANK[urgency] && (urgency === "U0" || critical))
        actionWarnings.push("Override cannot hide a protected referral or critical deadline.");
      else if (a.override.urgency === "U0" && !immediate && !critical)
        actionWarnings.push("Routine work cannot be overridden into protected immediate urgency.");
      else urgency = a.override.urgency;
    }
    const components = ranked.components;
    const supportScore = Object.values(components).reduce((sum, n) => sum + n, 0);
    if (a.confidence !== "CONFIRMED")
      actionWarnings.push(
        `Evidence confidence: ${a.confidence}. Verify facts; no legal entitlement inferred.`,
      );
    return {
      ...a,
      ruleTrace: ranked.trace,
      urgency,
      originalUrgency,
      orderingDeadline:
        a.origin === "IMMEDIATE_REFERRAL" && a.acknowledgedAt && a.nextReviewAt
          ? a.nextReviewAt
          : (a.dueAt ?? (a.origin === "IMMEDIATE_REFERRAL" ? a.activatedAt : null)),
      supportScore,
      components,
      explanation: `${labels[urgency]}: ${a.title}. ${a.evidence} Deadline origin: ${a.origin}. Support H${components.H} + A${components.A} + B${components.B} + D${components.D} + F${components.F} = ${supportScore}/20; weights do not determine urgency.`,
      warnings: actionWarnings,
      suppressedDuplicates: duplicateCount.get(a.key) ?? 0,
    };
  }
  const scored = [...unique.values()]
    .filter(
      (a) => !["RESOLVED", "CANCELLED"].includes(a.status) && (!inactive || a.retainedAfterClosure),
    )
    .map(score);
  // Children propagate urgency/deadlines to their parent in one topological pass.
  const byKey = new Map(scored.map((a) => [a.key, a]));
  const inheritance = analyzeDag(
    [...byKey.keys()],
    scored.flatMap((a) =>
      a.parentKey && byKey.has(a.parentKey) ? [{ from: a.key, to: a.parentKey }] : [],
    ),
  );
  for (const key of inheritance.order) {
    const child = byKey.get(key)!,
      parent = child.parentKey ? byKey.get(child.parentKey) : undefined;
    if (
      parent &&
      compareActions(child, parent) < 0 &&
      RANK[child.urgency] <= RANK[parent.urgency]
    ) {
      parent.urgency = child.urgency;
      parent.orderingDeadline = child.orderingDeadline;
      parent.explanation = `${labels[parent.urgency]}: ${parent.title}. Dependency deadline: ${child.title}. ${parent.evidence}`;
    }
  }
  const actions = scored.sort(compareActions);
  const selectedAction = actions[0] ?? null;
  const past = input.hearings
    .filter(
      (h) =>
        instant(h.actualAt ?? h.scheduledAt) <= ms && !["PENDING", "CANCELLED"].includes(h.outcome),
    )
    .sort((a, b) => instant(b.actualAt ?? b.scheduledAt) - instant(a.actualAt ?? a.scheduledAt));
  let consecutiveAdjournments = 0;
  for (const h of past) {
    if (h.outcome !== "ADJOURNED") break;
    consecutiveAdjournments++;
  }
  const nextHearingAt =
    input.hearings
      .filter((h) => h.outcome === "PENDING" && calendarDays(at, h.scheduledAt) >= 0)
      .sort((a, b) => instant(a.scheduledAt) - instant(b.scheduledAt))[0]?.scheduledAt ?? null;
  if (consecutiveAdjournments >= 3)
    warnings.push(
      `${consecutiveAdjournments} completed hearings adjourned consecutively. Context only; no automatic accused-caused delay or legal threshold.`,
    );
  // Auto-derived OPEN rows are a cache of source facts. Persisting that cache
  // must not create a new fact version; human state and closed episodes do.
  const actionFacts = input.actions.filter(
    (a) =>
      !a.id.startsWith("auto:") ||
      a.status !== "OPEN" ||
      a.ownerOverride !== undefined ||
      a.override ||
      a.nextReviewAt ||
      a.acknowledgedAt,
  );
  const factsHash = sha256Hex(canonicalJson({ ...input, actions: actionFacts }));
  const semantic = {
    priorityLevel: selectedAction?.urgency ?? "U3",
    supportScore: selectedAction?.supportScore ?? 0,
    actions,
    plannedReviewAt: input.facts.nextPlannedReviewAt,
    nextHearingAt,
    consecutiveAdjournments,
    warnings,
    included: !inactive || actions.length > 0,
  };
  const boundaries = actions
    .flatMap((a) =>
      a.dueAt
        ? [
            instant(a.dueAt),
            instant(a.dueAt) - policy.immediateHours * 3_600_000,
            instant(a.dueAt) - policy.sensitiveHours * 3_600_000,
          ]
        : [],
    )
    .filter((t) => t > ms);
  return {
    ...semantic,
    caseId: input.caseId,
    caseRef: input.caseRef,
    selectedAction,
    explanation:
      selectedAction?.explanation ??
      "Scheduled/routine: no unresolved action currently requires attention. Review the planned date; this is not a legal assessment.",
    nextEvaluationAt: new Date(Math.min(ms + 60_000, ...boundaries)).toISOString(),
    evaluatedAt: at,
    policyVersion,
    engineVersion: ENGINE_VERSION,
    factsHash,
    evaluationKey: sha256Hex(
      canonicalJson({ factsHash, policy, policyVersion, engineVersion: ENGINE_VERSION, at }),
    ),
    outcomeHash: sha256Hex(
      canonicalJson({
        ...semantic,
        factsHash,
        policy,
        policyVersion,
        engineVersion: ENGINE_VERSION,
      }),
    ),
  };
}
