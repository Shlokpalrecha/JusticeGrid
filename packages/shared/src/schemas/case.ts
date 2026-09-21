import { z } from "zod";
import {
  BailStatusSchema,
  CaseStatusSchema,
  CustodyTypeSchema,
  PriorityLevelSchema,
} from "../enums.js";
import { BooleanQueryParamSchema, IdSchema, IsoDateTimeSchema } from "./common.js";
import { PaginationQuerySchema } from "../envelope.js";
import { PersonSchema } from "./person.js";
import { UserRefSchema } from "./user.js";

/** JG-YYYY-NNNN, e.g. "JG-2026-0001" (spec §5/§10). Client-supplied at
 * creation, not server-generated — validated here so a malformed
 * caseRef never reaches the database. */
export const CaseRefSchema = z
  .string()
  .regex(/^JG-\d{4}-\d{4}$/, "caseRef must match JG-YYYY-NNNN, e.g. JG-2026-0001");

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
    caseRef: CaseRefSchema,
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

export const CaseArchiveInputSchema = z
  .object({
    archivedReason: z.string().min(1),
  })
  .strict();
export type CaseArchiveInput = z.infer<typeof CaseArchiveInputSchema>;

/** GET /cases filter/sort/pagination params (spec §7). Every value is
 * optional; an absent filter simply isn't applied. */
export const CaseFilterQuerySchema = PaginationQuerySchema.extend({
  q: z.string().min(1).optional(),
  status: CaseStatusSchema.optional(),
  priority: PriorityLevelSchema.optional(),
  assignedTo: IdSchema.optional(),
  hearingFrom: IsoDateTimeSchema.optional(),
  hearingTo: IsoDateTimeSchema.optional(),
  hasOverdueTasks: BooleanQueryParamSchema.optional(),
  missingDocuments: BooleanQueryParamSchema.optional(),
  unassigned: BooleanQueryParamSchema.optional(),
  custodyType: CustodyTypeSchema.optional(),
  bailStatus: BailStatusSchema.optional(),
  district: z.string().min(1).optional(),
  court: z.string().min(1).optional(),
  sort: z.enum(["priority", "nextHearing", "caseRef", "createdAt"]).default("priority"),
}).strict();
export type CaseFilterQuery = z.infer<typeof CaseFilterQuerySchema>;

/** A page of the cases list — case rows plus enough embedded context
 * (person alias/display name, assignee) for a table row without a
 * second round-trip per row. */
export const CaseListItemSchema = CaseSchema.extend({
  person: PersonSchema.pick({ id: true, aliasCode: true, displayName: true, ageBand: true }),
  assignedTo: UserRefSchema.nullable(),
});
export type CaseListItemDto = z.infer<typeof CaseListItemSchema>;

/**
 * `GET /cases/:id`'s "full aggregate" (spec §7): the case plus its
 * person, charges, and assignee/creator — the Overview tab's data (spec
 * §9 screen 5). Hearings/tasks/documents/notes each have their own
 * dedicated list endpoints (`GET /cases/:id/hearings` etc.) rather than
 * being embedded here, matching how spec §7 itself splits them out.
 */
export const CaseAggregateSchema = CaseSchema.extend({
  person: PersonSchema,
  charges: z.array(ChargeSchema),
  assignedTo: UserRefSchema.nullable(),
  createdBy: UserRefSchema,
  // The Overview tab's "data-completeness meter" (spec §9 screen 5) —
  // mirrors exactly the fields the default R-CASE-INCOMPLETE rule checks
  // (spec §6.6: custodyStartDate, courtName, caseStatus, charges), so
  // what the UI shows as "missing" is always what would actually trigger
  // that rule once Phase 5 wires evaluation in.
  fieldCompleteness: z.object({
    checkedFields: z.array(z.string()),
    missingFields: z.array(z.string()),
  }),
});
export type CaseAggregateDto = z.infer<typeof CaseAggregateSchema>;
