import type { PriorityLevel, RulesetConfig } from "./types.js";

export interface ScoreResult {
  rawScore: number;
  totalScore: number;
  priorityLevel: PriorityLevel;
}

/**
 * Scoring and banding (spec §6.4):
 *   rawScore   = Σ weight of every triggered, enabled rule
 *   totalScore = maxScoreCap ? min(rawScore, maxScoreCap) : rawScore
 *   HIGH    if totalScore >= highThreshold
 *   MEDIUM  if totalScore >= mediumThreshold
 *   ROUTINE otherwise
 */
export function computeScore(triggeredPoints: number[], config: RulesetConfig): ScoreResult {
  const rawScore = triggeredPoints.reduce((sum, points) => sum + points, 0);
  const totalScore =
    config.maxScoreCap !== undefined ? Math.min(rawScore, config.maxScoreCap) : rawScore;

  let priorityLevel: PriorityLevel;
  if (totalScore >= config.highThreshold) {
    priorityLevel = "HIGH";
  } else if (totalScore >= config.mediumThreshold) {
    priorityLevel = "MEDIUM";
  } else {
    priorityLevel = "ROUTINE";
  }

  return { rawScore, totalScore, priorityLevel };
}
