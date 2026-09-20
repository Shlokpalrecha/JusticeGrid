import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/** Append-only — no update schema exists on purpose (spec §5: "no edit"). */
export const CaseNoteSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  authorId: IdSchema,
  body: z.string().min(1),
  isInternal: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type CaseNoteDto = z.infer<typeof CaseNoteSchema>;

export const CaseNoteCreateInputSchema = z
  .object({
    body: z.string().min(1),
    isInternal: z.boolean().default(true),
  })
  .strict();
export type CaseNoteCreateInput = z.infer<typeof CaseNoteCreateInputSchema>;
