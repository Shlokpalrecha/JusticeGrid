import type { CaseEvaluationInput, RuleDefinition, RulesetConfig } from "../types.js";

/**
 * Shared test-only builders. A fixed reference "today" (2026-09-20, in
 * Asia/Kolkata) is used throughout the suite so every test's dates are
 * expressed relative to a single, readable anchor.
 */
export const TODAY = "2026-09-20";
export const NOW = new Date("2026-09-20T04:00:00.000Z"); // 09:30 IST, same Kolkata calendar day

export function baseInput(overrides: Partial<CaseEvaluationInput> = {}): CaseEvaluationInput {
  return {
    caseId: "case-1",
    caseRef: "JG-2026-0001",
    assignedToId: "user-1",
    caseStatus: "TRIAL_ONGOING",
    custodyType: "JUDICIAL",
    custodyStartDate: "2026-01-01",
    nextHearingDate: null,
    lastHearingDate: null,
    lastActivityAt: "2026-09-15",
    bailStatus: "NOT_APPLIED",
    bailAppliedDate: null,
    consecutiveAdjournments: 0,
    requiredFieldsPresent: {},
    lastHearing: null,
    tasks: [],
    documents: [],
    ...overrides,
  };
}

export function baseRule(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    id: "rule-1",
    code: "R-TEST",
    name: "Test rule",
    category: "HEARING",
    conditionType: "HEARING_WITHIN_DAYS",
    params: { days: 3 },
    weight: 4,
    isEnabled: true,
    displayTemplate: "Test rule triggered",
    version: 1,
    ...overrides,
  };
}

export function baseConfig(overrides: Partial<RulesetConfig> = {}): RulesetConfig {
  return {
    version: 1,
    highThreshold: 7,
    mediumThreshold: 3,
    ...overrides,
  };
}
