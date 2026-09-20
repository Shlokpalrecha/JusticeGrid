import { z } from "zod";
import {
  BailStatusSchema,
  CaseStatusSchema,
  CustodyTypeSchema,
  PriorityLevelSchema,
} from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

export const CaseSchema = z.object({
  id: IdSchema,
  caseRef: z.string().min(1),
  personId: IdSchema,
  courtName: z.string().min(1),
  courtType: z.string().min(1),
  district: z.string().min(1),
  state: z.string().min(1),
  policeStationAlias: z.string().min(1),
  firNumberSynthetic: z.string().min(1),
  firYear: z.number().int(),
  caseStatus: CaseStatusSchema,
  custodyType: CustodyTypeSchema,
  custodyStartDate: IsoDateTimeSchema.nullable(),
  bailStatus: BailStatusSchema,
  bailAppliedDate: IsoDateTimeSchema.nullable(),
  assignedToId: IdSchema.nullable(),
  assignedAt: IsoDateTimeSchema.nullable(),
  assignedById: IdSchema.nullable(),
  createdById: IdSchema,
  lastHearingDate: IsoDateTimeSchema.nullable(),
  nextHearingDate: IsoDateTimeSchema.nullable(),
  lastActivityAt: IsoDateTimeSchema,
  // Deliberately denormalized onto the row — see apps/api/prisma/schema.prisma.
  currentPriorityLevel: PriorityLevelSchema.nullable(),
  currentPriorityScore: z.number().int().nullable(),
  lastEvaluatedAt: IsoDateTimeSchema.nullable(),
  isArchived: z.boolean(),
  archivedReason: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CaseDto = z.infer<typeof CaseSchema>;

export const CaseCreateInputSchema = z
  .object({
    caseRef: z.string().min(1),
    personId: IdSchema,
    courtName: z.string().min(1),
    courtType: z.string().min(1),
    district: z.string().min(1),
    state: z.string().min(1),
    policeStationAlias: z.string().min(1),
    firNumberSynthetic: z.string().min(1),
    firYear: z.number().int(),
    caseStatus: CaseStatusSchema.default("REGISTERED"),
    custodyType: CustodyTypeSchema,
    custodyStartDate: IsoDateTimeSchema.optional(),
    bailStatus: BailStatusSchema.default("NOT_APPLIED"),
    bailAppliedDate: IsoDateTimeSchema.optional(),
  })
  .strict();
export type CaseCreateInput = z.infer<typeof CaseCreateInputSchema>;

/**
 * `caseRef` is immutable after creation (spec §8.5) — it is deliberately
 * excluded from the update schema rather than merely ignored, so an
 * attempt to change it is a VALIDATION_ERROR (unknown key, `.strict()`),
 * not a silently-dropped no-op.
 */
export const CaseUpdateInputSchema = CaseCreateInputSchema.omit({ caseRef: true })
  .partial()
  .strict();
export type CaseUpdateInput = z.infer<typeof CaseUpdateInputSchema>;

export const CaseAssignInputSchema = z
  .object({
    userId: IdSchema,
    reason: z.string().optional(),
  })
  .strict();
export type CaseAssignInput = z.infer<typeof CaseAssignInputSchema>;

export const ChargeSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  actName: z.string().min(1),
  sectionCode: z.string().min(1),
  description: z.string().nullable(),
  isBailableFlag: z.boolean(),
  severityBand: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});
export type ChargeDto = z.infer<typeof ChargeSchema>;

export const ChargeCreateInputSchema = z
  .object({
    actName: z.string().min(1),
    sectionCode: z.string().min(1),
    description: z.string().optional(),
    isBailableFlag: z.boolean(),
    severityBand: z.string().min(1),
  })
  .strict();
export type ChargeCreateInput = z.infer<typeof ChargeCreateInputSchema>;
