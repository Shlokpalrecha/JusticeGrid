import type { Case } from "@prisma/client";

/**
 * The Case-field subset the default R-CASE-INCOMPLETE rule checks (spec
 * §6.6). Shared by cases.service.ts's Overview-tab completeness meter
 * and lib/priorityEvaluation.ts's `requiredFieldsPresent` (spec §6.1's
 * CaseEvaluationInput field, consumed by the CASE_FIELD_INCOMPLETE
 * condition) — one function, so the two can never disagree about what
 * "missing" means.
 */
export const CASE_REQUIRED_FIELDS = [
  "custodyStartDate",
  "courtName",
  "caseStatus",
  "charges",
] as const;

export function computeRequiredFieldsPresent(
  caseRow: Pick<Case, "custodyStartDate" | "courtName" | "caseStatus">,
  chargeCount: number,
): Record<(typeof CASE_REQUIRED_FIELDS)[number], boolean> {
  return {
    custodyStartDate: caseRow.custodyStartDate !== null,
    courtName: caseRow.courtName.trim().length > 0,
    caseStatus: Boolean(caseRow.caseStatus),
    charges: chargeCount > 0,
  };
}
