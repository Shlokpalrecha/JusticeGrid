import type { ConditionType, RuleCategory } from "@prisma/client";

/**
 * The default seeded ruleset (spec §6.6), v1. Defined once here so it can
 * be reused by both the integration-test fixtures
 * (`../test/dbHelpers.ts`) and Phase 7's real seed script — spec §6.6's
 * table is the single source of truth; do not hand-duplicate it
 * elsewhere. `category` per rule is a reasonable editorial grouping (the
 * spec's table itself only lists code/name/conditionType/params/weight,
 * not category) chosen to match each rule's domain.
 */
export interface DefaultRuleSeed {
  code: string;
  name: string;
  description: string;
  category: RuleCategory;
  conditionType: ConditionType;
  params: Record<string, number | string | boolean | string[]>;
  weight: number;
  displayTemplate: string;
}

export const DEFAULT_RULESET: readonly DefaultRuleSeed[] = [
  {
    code: "R-HEARING-3D-PREP",
    name: "Hearing within 3 days with incomplete preparation",
    description:
      "The case has a hearing scheduled within 3 days and at least one preparation task is not yet complete.",
    category: "HEARING",
    conditionType: "HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE",
    params: { days: 3 },
    weight: 4,
    displayTemplate: "Hearing in {daysUntil} day(s) with incomplete preparation",
  },
  {
    code: "R-HEARING-3D",
    name: "Hearing within 3 days",
    description: "The case has a hearing scheduled within the next 3 days.",
    category: "HEARING",
    conditionType: "HEARING_WITHIN_DAYS",
    params: { days: 3 },
    weight: 4,
    displayTemplate: "Hearing in {daysUntil} day(s)",
  },
  {
    code: "R-HEARING-7D",
    name: "Hearing within 7 days",
    description: "The case has a hearing scheduled within the next 7 days.",
    category: "HEARING",
    conditionType: "HEARING_WITHIN_DAYS",
    params: { days: 7 },
    weight: 2,
    displayTemplate: "Hearing in {daysUntil} day(s)",
  },
  {
    code: "R-TASK-OVERDUE",
    name: "Follow-up task is overdue",
    description: "At least one open task's due date has passed.",
    category: "TASK",
    conditionType: "TASK_OVERDUE",
    params: { graceDays: 0 },
    weight: 4,
    displayTemplate: "Task overdue by {daysOverdue} day(s)",
  },
  {
    code: "R-TASK-DUE-2D",
    name: "Task due within 2 days",
    description: "At least one open task is due within the next 2 days.",
    category: "TASK",
    conditionType: "TASK_DUE_WITHIN_DAYS",
    params: { days: 2 },
    weight: 2,
    displayTemplate: "Task due in {daysUntil} day(s)",
  },
  {
    code: "R-DOC-MISSING",
    name: "Mandatory document missing",
    description: "At least one mandatory document requirement has not been received.",
    category: "DOCUMENT",
    conditionType: "MANDATORY_DOCUMENT_MISSING",
    params: {},
    weight: 3,
    displayTemplate: "{count} mandatory document(s) missing",
  },
  {
    code: "R-CASE-INCOMPLETE",
    name: "Case information incomplete",
    description: "One or more required case fields are missing.",
    category: "DATA_QUALITY",
    conditionType: "CASE_FIELD_INCOMPLETE",
    params: { fields: ["custodyStartDate", "courtName", "caseStatus", "charges"] },
    weight: 2,
    displayTemplate: "Missing field(s): {missingFields}",
  },
  {
    code: "R-NO-ASSIGNEE",
    name: "No user assigned to case",
    description: "The case has no assigned legal professional.",
    category: "ASSIGNMENT",
    conditionType: "NO_ASSIGNEE",
    params: {},
    weight: 2,
    displayTemplate: "No assignee on this case",
  },
  {
    code: "R-TASK-UNASSIGNED",
    name: "Open task has no owner",
    description: "At least one open task has no assigned user.",
    category: "ASSIGNMENT",
    conditionType: "TASK_UNASSIGNED",
    params: {},
    weight: 2,
    displayTemplate: "{count} open task(s) with no owner",
  },
  {
    code: "R-ORDER-UNREVIEWED",
    name: "Latest order not reviewed",
    description: "The order from the most recent past hearing has not been marked reviewed.",
    category: "HEARING",
    conditionType: "ORDER_NOT_REVIEWED_AFTER_DAYS",
    params: { days: 7 },
    weight: 3,
    displayTemplate: "Order unreviewed for {daysSince} day(s)",
  },
  {
    code: "R-NO-HEARING-DATE",
    name: "Next hearing date not recorded",
    description: "The case has no recorded next hearing date.",
    category: "HEARING",
    conditionType: "HEARING_DATE_MISSING",
    params: {},
    weight: 3,
    displayTemplate: "No next hearing date recorded",
  },
  {
    code: "R-STALE-CASE",
    name: "No activity recorded recently",
    description: "No recorded activity on this case for over 30 days.",
    category: "ACTIVITY",
    conditionType: "NO_ACTIVITY_SINCE_DAYS",
    params: { days: 30 },
    weight: 1,
    displayTemplate: "No activity for {daysSince} day(s)",
  },
  {
    code: "R-BAIL-STALLED",
    name: "Bail application pending without outcome",
    description: "A bail application has been pending for over 21 days without an outcome.",
    category: "CUSTODY",
    conditionType: "BAIL_APPLICATION_STALLED_DAYS",
    params: { days: 21 },
    weight: 2,
    displayTemplate: "Bail application pending for {daysSince} day(s)",
  },
  {
    code: "R-ADJOURN-3X",
    name: "Hearing adjourned 3+ consecutive times",
    description: "The last 3 or more hearings on this case were consecutively adjourned.",
    category: "HEARING",
    conditionType: "HEARING_ADJOURNED_CONSECUTIVELY",
    params: { count: 3 },
    weight: 2,
    displayTemplate: "Adjourned {count} times consecutively",
  },
  {
    code: "R-DOC-UNVERIFIED",
    name: "Received document not verified",
    description: "A received document has not been verified for over 10 days.",
    category: "DOCUMENT",
    conditionType: "DOCUMENT_UNVERIFIED_OVER_DAYS",
    params: { days: 10 },
    weight: 1,
    displayTemplate: "Unverified for {daysSince} day(s)",
  },
  {
    code: "R-TASK-BLOCKED",
    name: "Task blocked for too long",
    description: "At least one task has been blocked for more than 7 days.",
    category: "TASK",
    conditionType: "TASK_BLOCKED_OVER_DAYS",
    params: { days: 7 },
    weight: 2,
    displayTemplate: "Blocked for {daysSince} day(s)",
  },
  {
    code: "R-CUSTODY-LONG",
    name: "Extended custody duration — review follow-ups",
    description: "The person has been in custody for more than 180 days.",
    category: "CUSTODY",
    conditionType: "CUSTODY_DURATION_EXCEEDS_DAYS",
    params: { days: 180 },
    weight: 1,
    displayTemplate: "In custody for {daysSince} day(s)",
  },
] as const;
