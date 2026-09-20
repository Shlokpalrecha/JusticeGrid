// Public entry point for @justicegrid/rules-engine.
//
// This package is pure and dependency-free: it must never import Prisma,
// date libraries, or reach into the database (spec §4, §6.1). It takes a
// plain CaseEvaluationInput plus an injected `now: Date` and returns a
// plain, explainable, fully deterministic EvaluationResult.

export { ENGINE_VERSION } from "./version.js";
export { evaluateCase, buildQueue } from "./evaluate.js";
export { computeScore } from "./score.js";
export type { ScoreResult } from "./score.js";
export { buildExplanation, renderReasonText } from "./explain.js";
export { computeInputHash, canonicalJson, sha256Hex } from "./hash.js";
export { toKolkataDateString, normalizeDateString, daysBetween, isWithinDays } from "./date.js";
export { CONDITION_EVALUATORS } from "./conditions.js";
export type { ConditionEvaluator } from "./conditions.js";

export type {
  CaseEvaluationInput,
  ConditionResult,
  ConditionType,
  DocumentInput,
  EvaluationResult,
  LastHearingInput,
  PriorityLevel,
  RuleDefinition,
  RuleParams,
  RulesetConfig,
  TaskInput,
  TriggeredReasonResult,
} from "./types.js";
