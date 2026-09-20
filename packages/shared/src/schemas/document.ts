import { z } from "zod";
import { DocumentStatusSchema, DocumentTypeSchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

export const DocumentRequirementSchema = z.object({
  id: IdSchema,
  caseId: IdSchema,
  documentType: DocumentTypeSchema,
  isMandatory: z.boolean(),
  status: DocumentStatusSchema,
  requestedAt: IsoDateTimeSchema.nullable(),
  receivedAt: IsoDateTimeSchema.nullable(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  verifiedById: IdSchema.nullable(),
  sourceNote: z.string().nullable(),
  remarks: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DocumentRequirementDto = z.infer<typeof DocumentRequirementSchema>;

export const DocumentCreateInputSchema = z
  .object({
    documentType: DocumentTypeSchema,
    isMandatory: z.boolean().default(true),
    sourceNote: z.string().optional(),
    remarks: z.string().optional(),
  })
  .strict();
export type DocumentCreateInput = z.infer<typeof DocumentCreateInputSchema>;

export const DocumentUpdateInputSchema = z
  .object({
    status: DocumentStatusSchema.optional(),
    sourceNote: z.string().optional(),
    remarks: z.string().optional(),
  })
  .strict();
export type DocumentUpdateInput = z.infer<typeof DocumentUpdateInputSchema>;

export const DocumentVerifyInputSchema = z
  .object({
    remarks: z.string().optional(),
  })
  .strict();
export type DocumentVerifyInput = z.infer<typeof DocumentVerifyInputSchema>;
