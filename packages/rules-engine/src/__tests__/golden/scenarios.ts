import type { CaseEvaluationInput, RuleDefinition, RulesetConfig } from "../../types.js";

/**
 * Golden snapshot scenarios (spec §11: "fixture inputs → committed JSON
 * outputs in __tests__/golden/*.json"). Each scenario's evaluateCase
 * result is committed as JSON and re-asserted on every test run — a
 * regression in scoring, ordering of reasons, hashing, or explanation
 * text changes one of these files' diff, making the change visible in
 * code review even if no single unit test happens to cover it.
 *
 * These are the engine's own representative fixtures, built for the
 * engine's test suite — not the six literal fixture cases from spec §10
 * (Case A–F), which are Phase 7's concern once fixtures.ts defines their
 * exact seed data; those get their own golden tests then, alongside an
 * API integration test, per spec §10's "Snapshot-test these six in the
 * rules-engine golden tests AND in an API integration test."
 */

export const GOLDEN_NOW = new Date("2026-09-20T04:00:00.000Z");

export interface GoldenScenario {
  name: string;
  input: CaseEvaluationInput;
  rules: RuleDefinition[];
  config: RulesetConfig;
}

const seededRuleset: RuleDefinition[] = [
  {
    id: "rule-hearing-3d-prep",
    code: "R-HEARING-3D-PREP",
    name: "Hearing within 3 days with incomplete preparation",
    category: "HEARING",
    conditionType: "HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE",
    params: { days: 3 },
    weight: 4,
    isEnabled: true,
    displayTemplate:
      "Hearing is within {days} days ({nextHearingDate}) and preparation is incomplete",
    version: 1,
  },
  {
    id: "rule-task-overdue",
    code: "R-TASK-OVERDUE",
    name: "Follow-up task is overdue",
    category: "TASK",
    conditionType: "TASK_OVERDUE",
    params: { graceDays: 0 },
    weight: 4,
    isEnabled: true,
    displayTemplate: "{overdueTaskCount} follow-up task(s) overdue",
    version: 1,
  },
  {
    id: "rule-doc-missing",
    code: "R-DOC-MISSING",
    name: "Mandatory document missing",
    category: "DOCUMENT",
    conditionType: "MANDATORY_DOCUMENT_MISSING",
    params: {},
    weight: 3,
    isEnabled: true,
    displayTemplate: "{missingDocumentCount} mandatory document(s) missing",
    version: 1,
  },
  {
    id: "rule-no-assignee",
    code: "R-NO-ASSIGNEE",
    name: "No user assigned to case",
    category: "ASSIGNMENT",
    conditionType: "NO_ASSIGNEE",
    params: {},
    weight: 2,
    isEnabled: true,
    displayTemplate: "No team member is currently assigned to this case",
    version: 1,
  },
  {
    id: "rule-no-hearing-date",
    code: "R-NO-HEARING-DATE",
    name: "Next hearing date not recorded",
    category: "HEARING",
    conditionType: "HEARING_DATE_MISSING",
    params: {},
    weight: 3,
    isEnabled: true,
    displayTemplate: "No next hearing date has been recorded for this active case",
    version: 1,
  },
  {
    id: "rule-order-unreviewed",
    code: "R-ORDER-UNREVIEWED",
    name: "Latest order not reviewed",
    category: "HEARING",
    conditionType: "ORDER_NOT_REVIEWED_AFTER_DAYS",
    params: { days: 7 },
    weight: 3,
    isEnabled: true,
    displayTemplate:
      "The order from the hearing on {hearingScheduledDate} has not yet been reviewed",
    version: 1,
  },
  {
    id: "rule-adjourn-3x",
    code: "R-ADJOURN-3X",
    name: "Hearing adjourned 3+ consecutive times",
    category: "HEARING",
    conditionType: "HEARING_ADJOURNED_CONSECUTIVELY",
    params: { count: 3 },
    weight: 2,
    isEnabled: true,
    displayTemplate: "Hearing adjourned {consecutiveAdjournments} consecutive times",
    version: 1,
  },
  {
    id: "rule-bail-stalled",
    code: "R-BAIL-STALLED",
    name: "Bail application pending without outcome",
    category: "ACTIVITY",
    conditionType: "BAIL_APPLICATION_STALLED_DAYS",
    params: { days: 21 },
    weight: 2,
    isEnabled: true,
    displayTemplate:
      "Bail application has been pending for {daysSinceApplied} days with no outcome",
    version: 1,
  },
  {
    id: "rule-custody-long",
    code: "R-CUSTODY-LONG",
    name: "Extended custody duration — review follow-ups",
    category: "CUSTODY",
    conditionType: "CUSTODY_DURATION_EXCEEDS_DAYS",
    params: { days: 180 },
    weight: 1,
    isEnabled: true,
    displayTemplate:
      "Case has been in custody status for over {days} days — flagged for team review of pending follow-up actions.",
    version: 1,
  },
  // Deliberately disabled — golden-tested to prove disabled rules never
  // contribute to score/reasons/hash even when their condition is met.
  {
    id: "rule-stale-case",
    code: "R-STALE-CASE",
    name: "No activity recorded recently",
    category: "ACTIVITY",
    conditionType: "NO_ACTIVITY_SINCE_DAYS",
    params: { days: 30 },
    weight: 1,
    isEnabled: false,
    displayTemplate: "No activity recorded on this case for over {days} days",
    version: 1,
  },
];

const defaultConfig: RulesetConfig = { version: 1, highThreshold: 7, mediumThreshold: 3 };

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    name: "high-priority-hearing-task-document",
    rules: seededRuleset,
    config: defaultConfig,
    input: {
      caseId: "case-golden-1",
      caseRef: "JG-2026-9001",
      assignedToId: "user-1",
      caseStatus: "TRIAL_ONGOING",
      custodyType: "JUDICIAL",
      custodyStartDate: "2026-06-01",
      nextHearingDate: "2026-09-22",
      lastHearingDate: "2026-08-15",
      lastActivityAt: "2026-09-18",
      bailStatus: "NOT_APPLIED",
      bailAppliedDate: null,
      consecutiveAdjournments: 0,
      requiredFieldsPresent: {
        courtName: true,
        caseStatus: true,
        custodyStartDate: true,
        charges: true,
      },
      lastHearing: {
        id: "h1",
        scheduledDate: "2026-08-15",
        orderReviewed: true,
        orderRecordedAt: "2026-08-16",
      },
      tasks: [
        {
          id: "t1",
          status: "PENDING",
          dueDate: "2026-09-21",
          assignedToId: "user-1",
          isPreparationTask: true,
          blockedSince: null,
        },
        {
          id: "t2",
          status: "PENDING",
          dueDate: "2026-09-10",
          assignedToId: "user-1",
          isPreparationTask: false,
          blockedSince: null,
        },
      ],
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "MISSING",
          requestedAt: null,
        },
        {
          id: "d2",
          documentType: "CHARGE_SHEET",
          isMandatory: true,
          status: "VERIFIED",
          requestedAt: "2026-07-01",
        },
      ],
    },
  },
  {
    name: "routine-no-conditions-triggered",
    rules: seededRuleset,
    config: defaultConfig,
    input: {
      caseId: "case-golden-2",
      caseRef: "JG-2026-9002",
      assignedToId: "user-2",
      caseStatus: "TRIAL_ONGOING",
      custodyType: "NOT_IN_CUSTODY",
      custodyStartDate: null,
      nextHearingDate: "2026-10-15",
      lastHearingDate: "2026-09-01",
      lastActivityAt: "2026-09-19",
      bailStatus: "GRANTED",
      bailAppliedDate: "2026-08-01",
      consecutiveAdjournments: 0,
      requiredFieldsPresent: {
        courtName: true,
        caseStatus: true,
        custodyStartDate: true,
        charges: true,
      },
      lastHearing: {
        id: "h1",
        scheduledDate: "2026-09-01",
        orderReviewed: true,
        orderRecordedAt: "2026-09-02",
      },
      tasks: [],
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "VERIFIED",
          requestedAt: "2026-08-01",
        },
      ],
    },
  },
  {
    name: "unassigned-incomplete-medium-priority",
    rules: seededRuleset,
    config: defaultConfig,
    input: {
      caseId: "case-golden-3",
      caseRef: "JG-2026-9003",
      assignedToId: null,
      caseStatus: "REGISTERED",
      custodyType: "JUDICIAL",
      custodyStartDate: "2026-08-01",
      nextHearingDate: null,
      lastHearingDate: null,
      lastActivityAt: "2026-09-10",
      bailStatus: "NOT_APPLIED",
      bailAppliedDate: null,
      consecutiveAdjournments: 0,
      requiredFieldsPresent: {
        courtName: true,
        caseStatus: true,
        custodyStartDate: true,
        charges: false,
      },
      lastHearing: null,
      tasks: [],
      documents: [],
    },
  },
  {
    name: "every-condition-triggered-cap-test",
    rules: seededRuleset,
    config: { version: 1, highThreshold: 7, mediumThreshold: 3, maxScoreCap: 15 },
    input: {
      caseId: "case-golden-4",
      caseRef: "JG-2026-9004",
      assignedToId: null,
      caseStatus: "TRIAL_ONGOING",
      custodyType: "JUDICIAL",
      custodyStartDate: "2025-01-01",
      nextHearingDate: null,
      lastHearingDate: "2026-08-01",
      lastActivityAt: "2026-07-01",
      bailStatus: "APPLICATION_FILED",
      bailAppliedDate: "2026-06-01",
      consecutiveAdjournments: 4,
      requiredFieldsPresent: {
        courtName: false,
        caseStatus: true,
        custodyStartDate: true,
        charges: false,
      },
      lastHearing: {
        id: "h1",
        scheduledDate: "2026-08-01",
        orderReviewed: false,
        orderRecordedAt: null,
      },
      tasks: [
        {
          id: "t1",
          status: "BLOCKED",
          dueDate: "2026-07-01",
          assignedToId: null,
          isPreparationTask: true,
          blockedSince: "2026-08-01",
        },
      ],
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "MISSING",
          requestedAt: null,
        },
      ],
    },
  },
];
