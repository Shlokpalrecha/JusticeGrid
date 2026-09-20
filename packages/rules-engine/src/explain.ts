import type { PriorityLevel, RulesetConfig, TriggeredReasonResult } from "./types.js";

/**
 * Renders a rule's `displayTemplate` against its triggered evidence, e.g.
 * `"Hearing is within {days} days ({nextHearingDate}) and preparation is
 * incomplete"` + `{days: 3, nextHearingDate: "2026-10-12", ...}` →
 * `"Hearing is within 3 days (2026-10-12) and preparation is incomplete"`.
 *
 * A `{key}` with no matching evidence entry is left as literal text
 * rather than throwing — a malformed template on one rule should degrade
 * that one reason's readability, not abort the whole case's evaluation.
 */
export function renderReasonText(template: string, evidence: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in evidence)) return match;
    return stringifyEvidenceValue(evidence[key]);
  });
}

/** Templates only ever reference primitive evidence fields (days, a
 * date, a count) in practice, but an object/array value is stringified
 * safely via JSON rather than falling through to `String()`'s useless
 * "[object Object]". */
function stringifyEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * The arithmetic explanation string (spec §6.4), e.g.
 * `"4 + 4 + 3 = 11 → HIGH (≥ 7)"`. When no rule triggered, there is
 * nothing to sum — spec §10's Case B fixture expects the literal text
 * "No time-sensitive workflow condition triggered" in that situation.
 */
export function buildExplanation(
  reasons: TriggeredReasonResult[],
  rawScore: number,
  totalScore: number,
  priorityLevel: PriorityLevel,
  config: RulesetConfig,
): string {
  if (reasons.length === 0) {
    return "No time-sensitive workflow condition triggered";
  }

  const sumExpression = reasons.map((r) => r.points).join(" + ");
  const capNote = totalScore !== rawScore ? ` (capped to ${totalScore})` : "";
  const arithmetic = `${sumExpression} = ${rawScore}${capNote}`;

  const bandNote =
    priorityLevel === "HIGH"
      ? `HIGH (≥ ${config.highThreshold})`
      : priorityLevel === "MEDIUM"
        ? `MEDIUM (≥ ${config.mediumThreshold})`
        : `ROUTINE (< ${config.mediumThreshold})`;

  return `${arithmetic} → ${bandNote}`;
}
