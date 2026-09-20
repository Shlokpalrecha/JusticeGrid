import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/** Append-only audit trail of case reassignment — no update schema. */
export const CaseAssignmentHistorySchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  fromUserId: IdSchema.nullable(),
  toUserId: IdSchema.nullable(),
  changedById: IdSchema,
  reason: z.string().nullable(),
  changedAt: IsoDateTimeSchema,
});
export type CaseAssignmentHistoryDto = z.infer<typeof CaseAssignmentHistorySchema>;
