import type { CaseEvaluationInput, EvaluationResult } from "./types.js";

/**
 * Deterministic queue ordering (spec §6.5), applied as a chain of
 * tie-breakers so the final `caseRef` comparison always yields a strict
 * total order — the same set of results sorts identically no matter what
 * order they arrive in (verified by a shuffle property test).
 *
 * Tie-breaker 3 is "earliest open overdue task dueDate ASC" in spec
 * wording. `buildQueue` deliberately has no `now` parameter (see its
 * signature in spec §6.1), so "overdue" here can't be evaluated against
 * a live clock — ordering is a pure function of already-known field
 * values, not of when it happens to run. This is read as "earliest due
 * date among the case's currently-open tasks", which needs no `now` and
 * is exactly the tie-breaker a reviewer would want: among equally-scored
 * cases, the one with the nearest upcoming (or most overdue) open task
 * sorts first either way.
 */
const OPEN_TASK_STATUSES = new Set(["PENDING", "IN_PROGRESS", "BLOCKED"]);

function earliestOpenTaskDueDate(input: CaseEvaluationInput): string | null {
  const dueDates = input.tasks
    .filter((t) => OPEN_TASK_STATUSES.has(t.status))
    .map((t) => t.dueDate);
  if (dueDates.length === 0) return null;
  // YYYY-MM-DD (and full ISO datetime) strings sort correctly
  // lexicographically, so a plain string sort is sufficient here.
  return dueDates.slice().sort()[0] as string;
}

/** Ascending comparator for nullable ISO date(-time) strings, nulls last. */
function compareNullableAsc(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function buildQueue(
  results: EvaluationResult[],
  inputs: CaseEvaluationInput[],
): EvaluationResult[] {
  const inputById = new Map(inputs.map((input) => [input.caseId, input] as const));

  // Validated up front, not lazily inside the comparator: a comparator is
  // never even called by `Array.prototype.sort` for a 0- or 1-element
  // array, so a missing-input check that only lives inside the sort
  // callback would silently miss that case.
  for (const result of results) {
    if (!inputById.has(result.caseId)) {
      throw new Error(`buildQueue: no CaseEvaluationInput supplied for case "${result.caseId}"`);
    }
  }

  return results.slice().sort((resultA, resultB) => {
    // 1. totalScore DESC
    if (resultA.totalScore !== resultB.totalScore) {
      return resultB.totalScore - resultA.totalScore;
    }

    // Presence already validated above.
    const inputA = inputById.get(resultA.caseId) as CaseEvaluationInput;
    const inputB = inputById.get(resultB.caseId) as CaseEvaluationInput;

    // 2. nextHearingDate ASC (nulls last)
    const hearingCmp = compareNullableAsc(inputA.nextHearingDate, inputB.nextHearingDate);
    if (hearingCmp !== 0) return hearingCmp;

    // 3. earliest open task due date ASC (nulls last) — see file header.
    const taskCmp = compareNullableAsc(
      earliestOpenTaskDueDate(inputA),
      earliestOpenTaskDueDate(inputB),
    );
    if (taskCmp !== 0) return taskCmp;

    // 4. custodyStartDate ASC (nulls last)
    const custodyCmp = compareNullableAsc(inputA.custodyStartDate, inputB.custodyStartDate);
    if (custodyCmp !== 0) return custodyCmp;

    // 5. caseRef ASC — final, guarantees a strict total order.
    if (inputA.caseRef < inputB.caseRef) return -1;
    if (inputA.caseRef > inputB.caseRef) return 1;
    return 0;
  });
}
