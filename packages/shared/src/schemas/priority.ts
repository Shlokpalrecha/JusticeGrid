import { z } from "zod";
import { EvaluationTriggerSchema, PriorityLevelSchema, RuleCategorySchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";
import { PaginationQuerySchema } from "../envelope.js";
import { UserRefSchema } from "./user.js";

/**
 * Wire mirror of packages/rules-engine's `TriggeredReasonResult` (spec
 * §6.1), as persisted to and read back from the TriggeredReason table.
 */
export const TriggeredReasonSchema = z.object({
  id: IdSchema,
  evaluationId: IdSchema,
  ruleId: IdSchema.nullable(),
  ruleCode: z.string(),
  ruleName: z.string(),
  points: z.number().int(),
  category: RuleCategorySchema,
  reasonText: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  orderIndex: z.number().int(),
});
export type TriggeredReasonDto = z.infer<typeof TriggeredReasonSchema>;

/**
 * Wire mirror of packages/rules-engine's `EvaluationResult` (spec §6.1),
 * as persisted to and read back from the PriorityEvaluation table, with
 * its `reasons` populated from TriggeredReason rows for display in the
 * Priority Queue's explanation panel (spec §9, screen 3).
 */
export const PriorityEvaluationSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  evaluatedAt: IsoDateTimeSchema,
  totalScore: z.number().int(),
  rawScore: z.number().int(),
  priorityLevel: PriorityLevelSchema,
  rulesetVersion: z.number().int(),
  engineVersion: z.string(),
  inputHash: z.string(),
  triggeredCount: z.number().int(),
  durationMs: z.number().int(),
  triggeredBy: EvaluationTriggerSchema,
  triggeredById: IdSchema.nullable(),
  reasons: z.array(TriggeredReasonSchema),
  // Not a PriorityEvaluation column (spec §5's exact field list has
  // none) — the arithmetic line spec §9 requires the UI to show (e.g.
  // "4 + 4 + 3 = 11 → HIGH (≥ 7)") is reconstructed on read from the
  // stored reasons/scores plus the historical RulesetConfig row matching
  // `rulesetVersion`, via the rules-engine's own exported
  // `buildExplanation`, not stored separately. See
  // apps/api/src/lib/priorityEvaluation.ts.
  explanation: z.string(),
});
export type PriorityEvaluationDto = z.infer<typeof PriorityEvaluationSchema>;

/** Queue filter params (spec §9 screen 3: priority band, assignee, hearing
 * window, reason/rule code). */
export const PriorityQueueFilterSchema = PaginationQuerySchema.extend({
  priority: PriorityLevelSchema.optional(),
  assignedTo: IdSchema.optional(),
  hearingFrom: IsoDateTimeSchema.optional(),
  hearingTo: IsoDateTimeSchema.optional(),
  ruleCode: z.string().optional(),
}).strict();
export type PriorityQueueFilter = z.infer<typeof PriorityQueueFilterSchema>;

/** One ranked row in the Priority Queue (spec §9 screen 3): case
 * context plus its current evaluation, full reasons included so the
 * explanation panel needs no second round trip when a row expands. */
export const PriorityQueueItemSchema = z.object({
  rank: z.number().int(),
  caseId: IdSchema,
  caseRef: z.string(),
  personAlias: z.string(),
  nextHearingDate: IsoDateTimeSchema.nullable(),
  assignedTo: UserRefSchema.nullable(),
  evaluation: PriorityEvaluationSchema,
});
export type PriorityQueueItemDto = z.infer<typeof PriorityQueueItemSchema>;

export const PriorityDistributionSchema = z.object({
  ROUTINE: z.number().int(),
  MEDIUM: z.number().int(),
  HIGH: z.number().int(),
});
export type PriorityDistribution = z.infer<typeof PriorityDistributionSchema>;
