import { z } from "zod";
import { HearingOutcomeSchema, HearingTypeSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

export const HearingSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  scheduledDate: IsoDateTimeSchema,
  actualDate: IsoDateTimeSchema.nullable(),
  orderExpected: z.boolean(),
  orderReceivedAt: IsoDateTimeSchema.nullable(),
  hearingType: HearingTypeSchema,
  purpose: z.string().nullable(),
  outcome: HearingOutcomeSchema,
  wasProduced: z.boolean(),
  adjournmentReason: z.string().nullable(),
  orderSummary: z.string().nullable(),
  orderReviewed: z.boolean(),
  orderReviewedAt: IsoDateTimeSchema.nullable(),
  orderReviewedById: IdSchema.nullable(),
  nextHearingDate: IsoDateTimeSchema.nullable(),
  recordedById: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type HearingDto = z.infer<typeof HearingSchema>;

/**
 * Business validation from spec §8.5: `scheduledDate` must not be before
 * the case's `custodyStartDate`. That check is cross-entity (it needs the
 * case row) so it's enforced in the hearings service in Phase 4, not
 * here — this schema covers everything checkable from the payload alone.
 */
export const HearingCreateInputSchema = z
  .object({
    scheduledDate: IsoDateTimeSchema,
    actualDate: IsoDateTimeSchema.nullable().optional(),
    orderExpected: z.boolean().optional(),
    orderReceivedAt: IsoDateTimeSchema.nullable().optional(),
    hearingType: HearingTypeSchema,
    purpose: z.string().optional(),
    outcome: HearingOutcomeSchema.default("PENDING"),
    wasProduced: z.boolean().default(false),
    adjournmentReason: z.string().optional(),
    orderSummary: z.string().optional(),
    nextHearingDate: IsoDateTimeSchema.optional(),
  })
  .strict();
export type HearingCreateInput = z.infer<typeof HearingCreateInputSchema>;

export const HearingUpdateInputSchema = HearingCreateInputSchema.partial().strict();
export type HearingUpdateInput = z.infer<typeof HearingUpdateInputSchema>;

export const HearingMarkOrderReviewedInputSchema = z
  .object({
    orderSummary: z.string().optional(),
  })
  .strict();
export type HearingMarkOrderReviewedInput = z.infer<typeof HearingMarkOrderReviewedInputSchema>;

/** `GET /hearings/upcoming?days=7` (spec §7). */
export const HearingUpcomingQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).default(7),
  })
  .strict();
export type HearingUpcomingQuery = z.infer<typeof HearingUpcomingQuerySchema>;

/** Wire shape for the upcoming-hearings list — includes enough case
 * context (caseRef, assignee) to render without a second round trip. */
export const UpcomingHearingItemSchema = HearingSchema.extend({
  caseRef: z.string(),
  assignedToId: IdSchema.nullable(),
});
export type UpcomingHearingItemDto = z.infer<typeof UpcomingHearingItemSchema>;
