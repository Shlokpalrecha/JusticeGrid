import { z } from "zod";
import { EvaluationTriggerSchema, PriorityLevelSchema, RuleCategorySchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

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
});
export type PriorityEvaluationDto = z.infer<typeof PriorityEvaluationSchema>;

/** Queue filter params (spec §9 screen 3: priority band, assignee, hearing
 * window, reason/rule code). */
export const PriorityQueueFilterSchema = z
  .object({
    priority: PriorityLevelSchema.optional(),
    assignedTo: IdSchema.optional(),
    hearingFrom: IsoDateTimeSchema.optional(),
    hearingTo: IsoDateTimeSchema.optional(),
    ruleCode: z.string().optional(),
  })
  .strict();
export type PriorityQueueFilter = z.infer<typeof PriorityQueueFilterSchema>;
