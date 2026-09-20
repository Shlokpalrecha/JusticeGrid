import { daysBetween, isWithinDays } from "./date.js";
import type { CaseEvaluationInput, ConditionResult, ConditionType, RuleParams } from "./types.js";

/**
 * One pure predicate per `ConditionType` (spec §6.3). Each takes the
 * case's plain input, that rule's params, and "today" (already resolved
 * to its Asia/Kolkata calendar date by evaluate.ts), and returns whether
 * it triggered plus the evidence used to render its `displayTemplate`
 * and to explain the result in the UI.
 */

const OPEN_TASK_STATUSES = new Set(["PENDING", "IN_PROGRESS", "BLOCKED"]);
const TERMINAL_TASK_STATUSES = new Set(["COMPLETED", "CANCELLED"]);
const INACTIVE_CASE_STATUSES = new Set(["DISPOSED", "CLOSED", "TRANSFERRED"]);
const ACTIVE_BAIL_APPLICATION_STATUSES = new Set(["APPLICATION_FILED", "HEARING_SCHEDULED"]);
const CUSTODY_TYPES_COUNTING_AS_CUSTODY = new Set(["JUDICIAL", "POLICE"]);
const MISSING_DOCUMENT_STATUSES = new Set(["MISSING", "REJECTED"]);

// ── param accessors ────────────────────────────────────────────────────
// Rule.params comes from the database (validated at write time in
// Phase 5). These throw a clear, loud error on malformed params rather
// than silently miscomputing a workflow priority — in this domain, a
// wrong silent default is worse than a failed evaluation that surfaces
// the bad rule configuration immediately.

function requireNumberParam(params: RuleParams, key: string): number {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Rule param "${key}" must be a finite number, got: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireStringArrayParam(params: RuleParams, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`Rule param "${key}" must be a string array, got: ${JSON.stringify(value)}`);
  }
  return value;
}

// ── conditions ──────────────────────────────────────────────────────────

function hearingWithinDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  if (input.nextHearingDate === null) {
    return { triggered: false, evidence: { nextHearingDate: null } };
  }
  const daysUntil = daysBetween(today, input.nextHearingDate);
  return {
    triggered: isWithinDays(today, input.nextHearingDate, days),
    evidence: { days, nextHearingDate: input.nextHearingDate, daysUntil },
  };
}

function hearingWithinDaysAndPrepIncomplete(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const base = hearingWithinDays(input, params, today);
  const incompletePrepTasks = input.tasks.filter(
    (t) => t.isPreparationTask && !TERMINAL_TASK_STATUSES.has(t.status),
  );
  return {
    triggered: base.triggered && incompletePrepTasks.length > 0,
    evidence: {
      ...base.evidence,
      incompletePrepTaskCount: incompletePrepTasks.length,
      incompletePrepTaskIds: incompletePrepTasks.map((t) => t.id),
    },
  };
}

function hearingDateMissing(
  input: CaseEvaluationInput,
  _params: RuleParams,
  _today: string,
): ConditionResult {
  const isActive = !INACTIVE_CASE_STATUSES.has(input.caseStatus);
  return {
    triggered: isActive && input.nextHearingDate === null,
    evidence: { caseStatus: input.caseStatus, isActive },
  };
}

function taskOverdue(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const graceDays = requireNumberParam(params, "graceDays");
  const overdue = input.tasks
    .filter((t) => OPEN_TASK_STATUSES.has(t.status))
    .map((t) => ({ ...t, daysOverdue: daysBetween(t.dueDate, today) - graceDays }))
    .filter((t) => t.daysOverdue > 0);
  return {
    triggered: overdue.length > 0,
    evidence: {
      graceDays,
      overdueTaskCount: overdue.length,
      overdueTasks: overdue.map((t) => ({
        id: t.id,
        dueDate: t.dueDate,
        daysOverdue: t.daysOverdue,
      })),
    },
  };
}

function taskDueWithinDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  const dueSoon = input.tasks.filter(
    (t) => OPEN_TASK_STATUSES.has(t.status) && isWithinDays(today, t.dueDate, days),
  );
  return {
    triggered: dueSoon.length > 0,
    evidence: { days, dueSoonTaskCount: dueSoon.length, dueSoonTaskIds: dueSoon.map((t) => t.id) },
  };
}

function taskUnassigned(
  input: CaseEvaluationInput,
  _params: RuleParams,
  _today: string,
): ConditionResult {
  const unassigned = input.tasks.filter(
    (t) => OPEN_TASK_STATUSES.has(t.status) && t.assignedToId === null,
  );
  return {
    triggered: unassigned.length > 0,
    evidence: {
      unassignedTaskCount: unassigned.length,
      unassignedTaskIds: unassigned.map((t) => t.id),
    },
  };
}

function taskBlockedOverDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  const blocked = input.tasks
    .filter((t) => t.status === "BLOCKED" && t.blockedSince !== null)
    .map((t) => ({ id: t.id, daysBlocked: daysBetween(t.blockedSince as string, today) }))
    .filter((t) => t.daysBlocked > days);
  return {
    triggered: blocked.length > 0,
    evidence: { days, blockedTaskCount: blocked.length, blockedTasks: blocked },
  };
}

function mandatoryDocumentMissing(
  input: CaseEvaluationInput,
  _params: RuleParams,
  _today: string,
): ConditionResult {
  const missing = input.documents.filter(
    (d) => d.isMandatory && MISSING_DOCUMENT_STATUSES.has(d.status),
  );
  return {
    triggered: missing.length > 0,
    evidence: {
      missingDocumentCount: missing.length,
      missingDocumentTypes: missing.map((d) => d.documentType),
    },
  };
}

function documentUnverifiedOverDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  // The engine's input contract exposes only `requestedAt` for documents
  // (no separate receivedAt/verifiedAt timestamp), so "unverified for
  // over N days" is measured from requestedAt for any mandatory document
  // that has reached RECEIVED but not yet VERIFIED.
  const stale = input.documents
    .filter((d) => d.isMandatory && d.status === "RECEIVED" && d.requestedAt !== null)
    .map((d) => ({ id: d.id, daysSinceRequested: daysBetween(d.requestedAt as string, today) }))
    .filter((d) => d.daysSinceRequested > days);
  return {
    triggered: stale.length > 0,
    evidence: { days, staleDocumentCount: stale.length, staleDocuments: stale },
  };
}

function caseFieldIncomplete(
  input: CaseEvaluationInput,
  params: RuleParams,
  _today: string,
): ConditionResult {
  const fields = requireStringArrayParam(params, "fields");
  const missingFields = fields.filter((f) => input.requiredFieldsPresent[f] !== true);
  return {
    triggered: missingFields.length > 0,
    evidence: { checkedFields: fields, missingFields },
  };
}

function noAssignee(
  input: CaseEvaluationInput,
  _params: RuleParams,
  _today: string,
): ConditionResult {
  return {
    triggered: input.assignedToId === null,
    evidence: { assignedToId: input.assignedToId },
  };
}

function orderNotReviewedAfterDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  if (input.lastHearing === null) {
    return { triggered: false, evidence: { lastHearing: null } };
  }
  const daysSinceHearing = daysBetween(input.lastHearing.scheduledDate, today);
  return {
    triggered: daysSinceHearing > days && !input.lastHearing.orderReviewed,
    evidence: {
      days,
      hearingScheduledDate: input.lastHearing.scheduledDate,
      daysSinceHearing,
      orderReviewed: input.lastHearing.orderReviewed,
    },
  };
}

function custodyDurationExceedsDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  const inCustody =
    CUSTODY_TYPES_COUNTING_AS_CUSTODY.has(input.custodyType) && input.custodyStartDate !== null;
  const custodyDurationDays = inCustody
    ? daysBetween(input.custodyStartDate as string, today)
    : null;
  return {
    // Flags for team review of pending follow-up work only — never a
    // legal-entitlement or release recommendation (spec §6.3).
    triggered: inCustody && (custodyDurationDays as number) > days,
    evidence: { days, custodyType: input.custodyType, custodyDurationDays },
  };
}

function noActivitySinceDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  if (input.lastActivityAt === null) {
    return { triggered: false, evidence: { lastActivityAt: null } };
  }
  const daysSinceActivity = daysBetween(input.lastActivityAt, today);
  return {
    triggered: daysSinceActivity > days,
    evidence: { days, lastActivityAt: input.lastActivityAt, daysSinceActivity },
  };
}

function bailApplicationStalledDays(
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
): ConditionResult {
  const days = requireNumberParam(params, "days");
  const isStallable =
    ACTIVE_BAIL_APPLICATION_STATUSES.has(input.bailStatus) && input.bailAppliedDate !== null;
  const daysSinceApplied = isStallable ? daysBetween(input.bailAppliedDate as string, today) : null;
  return {
    triggered: isStallable && (daysSinceApplied as number) > days,
    evidence: { days, bailStatus: input.bailStatus, daysSinceApplied },
  };
}

function hearingAdjournedConsecutively(
  input: CaseEvaluationInput,
  params: RuleParams,
  _today: string,
): ConditionResult {
  const count = requireNumberParam(params, "count");
  return {
    triggered: input.consecutiveAdjournments >= count,
    evidence: { count, consecutiveAdjournments: input.consecutiveAdjournments },
  };
}

export type ConditionEvaluator = (
  input: CaseEvaluationInput,
  params: RuleParams,
  today: string,
) => ConditionResult;

export const CONDITION_EVALUATORS: Record<ConditionType, ConditionEvaluator> = {
  HEARING_WITHIN_DAYS: hearingWithinDays,
  HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE: hearingWithinDaysAndPrepIncomplete,
  HEARING_DATE_MISSING: hearingDateMissing,
  TASK_OVERDUE: taskOverdue,
  TASK_DUE_WITHIN_DAYS: taskDueWithinDays,
  TASK_UNASSIGNED: taskUnassigned,
  TASK_BLOCKED_OVER_DAYS: taskBlockedOverDays,
  MANDATORY_DOCUMENT_MISSING: mandatoryDocumentMissing,
  DOCUMENT_UNVERIFIED_OVER_DAYS: documentUnverifiedOverDays,
  CASE_FIELD_INCOMPLETE: caseFieldIncomplete,
  NO_ASSIGNEE: noAssignee,
  ORDER_NOT_REVIEWED_AFTER_DAYS: orderNotReviewedAfterDays,
  CUSTODY_DURATION_EXCEEDS_DAYS: custodyDurationExceedsDays,
  NO_ACTIVITY_SINCE_DAYS: noActivitySinceDays,
  BAIL_APPLICATION_STALLED_DAYS: bailApplicationStalledDays,
  HEARING_ADJOURNED_CONSECUTIVELY: hearingAdjournedConsecutively,
};
