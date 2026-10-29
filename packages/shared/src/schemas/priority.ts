import { z } from "zod";
import { PriorityLevelSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";
import { PaginationQuerySchema } from "../envelope.js";
import { UserRefSchema } from "./user.js";
import {
  ActionStatusSchema,
  ActionTypeSchema,
  ConfidenceSchema,
  DeadlineOriginSchema,
  SourceIdSchema,
} from "./workflow.js";
export const ActionResultSchema = z.object({
  ruleTrace: z
    .array(
      z.object({
        id: z.string(),
        expression: z.string(),
        result: z.boolean().nullable(),
        value: z.number().nullable(),
      }),
    )
    .optional(),
  ownerOverride: z.string().nullable().optional(),
  sourceKey: z.string().optional(),
  nextReviewAt: IsoDateTimeSchema.nullable().optional(),
  id: z.string(),
  key: z.string(),
  type: ActionTypeSchema,
  title: z.string(),
  status: ActionStatusSchema,
  activatedAt: IsoDateTimeSchema,
  dueAt: IsoDateTimeSchema.nullable(),
  origin: DeadlineOriginSchema,
  confidence: ConfidenceSchema,
  sourceId: SourceIdSchema,
  locator: z.string(),
  evidence: z.string(),
  ownerId: z.string().nullable(),
  critical: z.boolean(),
  forthwith: z.boolean(),
  retainedAfterClosure: z.boolean(),
  parentKey: z.string().nullable(),
  hearingId: z.string().nullable(),
  blocker: z.enum(["NONE", "ORDINARY", "NECESSARY"]),
  criticalDataMissing: z.boolean(),
  ordinaryDataMissing: z.boolean(),
  acknowledgedAt: IsoDateTimeSchema.nullable(),
  resolvedAt: IsoDateTimeSchema.nullable(),
  resolutionEvidence: z.string().nullable(),
  override: z
    .object({
      urgency: PriorityLevelSchema,
      reason: z.string(),
      expiresAt: IsoDateTimeSchema,
      reviewerId: z.string(),
    })
    .nullable(),
  urgency: PriorityLevelSchema,
  originalUrgency: PriorityLevelSchema,
  orderingDeadline: IsoDateTimeSchema.nullable(),
  supportScore: z.number().int().min(0).max(20),
  components: z.object({
    H: z.number(),
    A: z.number(),
    B: z.number(),
    D: z.number(),
    F: z.number(),
  }),
  explanation: z.string(),
  warnings: z.array(z.string()),
  suppressedDuplicates: z.number().int(),
});
export type ActionResultDto = z.infer<typeof ActionResultSchema>;
export const PriorityEvaluationSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  caseRef: z.string(),
  evaluatedAt: IsoDateTimeSchema,
  priorityLevel: PriorityLevelSchema,
  supportScore: z.number().int().min(0).max(20),
  plannedReviewAt: IsoDateTimeSchema.nullable(),
  selectedAction: ActionResultSchema.nullable(),
  actions: z.array(ActionResultSchema),
  explanation: z.string(),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  nextCheckAt: IsoDateTimeSchema.nullable().optional(),
  nextEvaluationAt: IsoDateTimeSchema,
  policyVersion: z.number().int(),
  engineVersion: z.string(),
  evaluationKey: z.string(),
  factsHash: z.string(),
  outcomeHash: z.string(),
  warnings: z.array(z.string()),
  nextHearingAt: IsoDateTimeSchema.nullable(),
  consecutiveAdjournments: z.number().int(),
  included: z.boolean(),
  triggeredBy: z.string(),
  triggeredById: IdSchema.nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
});
export type PriorityEvaluationDto = z.infer<typeof PriorityEvaluationSchema>;
export const PriorityQueueFilterSchema = PaginationQuerySchema.extend({
  priority: PriorityLevelSchema.optional(),
  assignedTo: IdSchema.optional(),
  hearingFrom: IsoDateTimeSchema.optional(),
  hearingTo: IsoDateTimeSchema.optional(),
  actionType: ActionTypeSchema.optional(),
  lane: z.enum(["REFERRAL", "LEGAL_DEADLINE", "OLDEST"]).optional(),
}).strict();
export type PriorityQueueFilter = z.infer<typeof PriorityQueueFilterSchema>;
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
  U0: z.number().int(),
  U1: z.number().int(),
  U2: z.number().int(),
  U3: z.number().int(),
});
export type PriorityDistribution = z.infer<typeof PriorityDistributionSchema>;
