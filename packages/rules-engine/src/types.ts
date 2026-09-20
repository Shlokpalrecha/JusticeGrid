/**
 * Public contract for @justicegrid/rules-engine (spec §6.1). This package
 * imports nothing — no Prisma, no date libraries, no DB — so every type
 * here is defined locally, including `ConditionType`, even though
 * packages/shared also defines an equivalent Zod enum. That duplication
 * is deliberate: it is the price of the architectural isolation spec §4
 * requires ("packages/rules-engine must import nothing"). Keep the two
 * lists in sync by hand.
 */

export type ConditionType =
  | "HEARING_WITHIN_DAYS"
  | "HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE"
  | "HEARING_DATE_MISSING"
  | "TASK_OVERDUE"
  | "TASK_DUE_WITHIN_DAYS"
  | "TASK_UNASSIGNED"
  | "TASK_BLOCKED_OVER_DAYS"
  | "MANDATORY_DOCUMENT_MISSING"
  | "DOCUMENT_UNVERIFIED_OVER_DAYS"
  | "CASE_FIELD_INCOMPLETE"
  | "NO_ASSIGNEE"
  | "ORDER_NOT_REVIEWED_AFTER_DAYS"
  | "CUSTODY_DURATION_EXCEEDS_DAYS"
  | "NO_ACTIVITY_SINCE_DAYS"
  | "BAIL_APPLICATION_STALLED_DAYS"
  | "HEARING_ADJOURNED_CONSECUTIVELY";

export type PriorityLevel = "ROUTINE" | "MEDIUM" | "HIGH";

/**
 * A rule's condition parameters, keyed by condition type per spec §6.3's
 * table (e.g. `{days: 3}`, `{graceDays: 0}`, `{count: 3}`,
 * `{fields: [...]}`, or `{}`).
 */
export type RuleParams = Record<string, number | string | boolean | string[]>;

export interface TaskInput {
  id: string;
  status: string;
  dueDate: string;
  assignedToId: string | null;
  isPreparationTask: boolean;
  blockedSince: string | null;
}

export interface DocumentInput {
  id: string;
  documentType: string;
  isMandatory: boolean;
  status: string;
  requestedAt: string | null;
}

export interface LastHearingInput {
  id: string;
  scheduledDate: string;
  orderReviewed: boolean;
  orderRecordedAt: string | null;
}

/**
 * The plain, fully-resolved input this engine evaluates. Every date field
 * is a normalized calendar-date string ("ISO date, no time" per spec
 * §6.1) — the engine additionally tolerates a full ISO datetime string on
 * any of these fields (normalizing it internally to its Asia/Kolkata
 * calendar date, see date.ts) so it stays robust if a caller passes
 * through a raw Prisma DateTime's JSON serialization unmodified.
 */
export interface CaseEvaluationInput {
  caseId: string;
  caseRef: string;
  assignedToId: string | null;
  caseStatus: string;
  custodyType: string;
  custodyStartDate: string | null;
  nextHearingDate: string | null;
  lastHearingDate: string | null;
  lastActivityAt: string | null;
  bailStatus: string;
  bailAppliedDate: string | null;
  consecutiveAdjournments: number;
  requiredFieldsPresent: Record<string, boolean>;
  lastHearing: LastHearingInput | null;
  tasks: TaskInput[];
  documents: DocumentInput[];
}

export interface RuleDefinition {
  id: string;
  code: string;
  name: string;
  category: string;
  conditionType: ConditionType;
  params: RuleParams;
  weight: number;
  isEnabled: boolean;
  displayTemplate: string;
  version: number;
}

export interface RulesetConfig {
  version: number;
  highThreshold: number;
  mediumThreshold: number;
  maxScoreCap?: number;
}

/** What a single condition predicate returns — see conditions.ts. */
export interface ConditionResult {
  triggered: boolean;
  evidence: Record<string, unknown>;
}

export interface TriggeredReasonResult {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  category: string;
  points: number;
  reasonText: string;
  evidence: Record<string, unknown>;
  orderIndex: number;
}

export interface EvaluationResult {
  caseId: string;
  rawScore: number;
  totalScore: number;
  priorityLevel: PriorityLevel;
  reasons: TriggeredReasonResult[];
  rulesetVersion: number;
  engineVersion: string;
  inputHash: string;
  evaluatedAtIso: string;
  explanation: string;
}
