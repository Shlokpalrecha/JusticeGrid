import { CONDITION_EVALUATORS } from "./conditions.js";
import { toKolkataDateString } from "./date.js";
import { buildExplanation, renderReasonText } from "./explain.js";
import { computeInputHash } from "./hash.js";
import { computeScore } from "./score.js";
import type {
  CaseEvaluationInput,
  EvaluationResult,
  RuleDefinition,
  RulesetConfig,
  TriggeredReasonResult,
} from "./types.js";
import { ENGINE_VERSION } from "./version.js";

function compareByCode(a: RuleDefinition, b: RuleDefinition): number {
  if (a.code < b.code) return -1;
  if (a.code > b.code) return 1;
  return 0;
}

/**
 * Evaluates one case against a ruleset, deterministically (spec §6).
 *
 * `now` is always injected — never read from the wall clock — and the
 * only source of "today" used anywhere in this evaluation. Running this
 * function twice with identical arguments produces a deep-equal result,
 * including `inputHash` and the order reasons appear in.
 */
export function evaluateCase(
  input: CaseEvaluationInput,
  rules: RuleDefinition[],
  config: RulesetConfig,
  now: Date,
): EvaluationResult {
  const today = toKolkataDateString(now);

  // Disabled rules are excluded entirely, up front — not evaluated, not
  // scored, not hashed as part of "the ruleset in effect". Sorting by
  // code before evaluation means reasons always come out in the same
  // stable order regardless of how `rules` was originally ordered
  // (e.g. by DB row insertion order, which is not meaningful here).
  const enabledRulesSorted = rules.filter((r) => r.isEnabled).sort(compareByCode);

  const reasons: TriggeredReasonResult[] = [];
  for (const rule of enabledRulesSorted) {
    const evaluator = CONDITION_EVALUATORS[rule.conditionType];
    const result = evaluator(input, rule.params, today);
    if (result.triggered) {
      reasons.push({
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleName: rule.name,
        category: rule.category,
        points: rule.weight,
        reasonText: renderReasonText(rule.displayTemplate, result.evidence),
        evidence: result.evidence,
        orderIndex: reasons.length,
      });
    }
  }

  const { rawScore, totalScore, priorityLevel } = computeScore(
    reasons.map((r) => r.points),
    config,
  );
  const explanation = buildExplanation(reasons, rawScore, totalScore, priorityLevel, config);
  const inputHash = computeInputHash(input, enabledRulesSorted, config);

  return {
    caseId: input.caseId,
    rawScore,
    totalScore,
    priorityLevel,
    reasons,
    rulesetVersion: config.version,
    engineVersion: ENGINE_VERSION,
    inputHash,
    evaluatedAtIso: now.toISOString(),
    explanation,
  };
}

export { buildQueue } from "./ordering.js";
