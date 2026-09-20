import { z } from "zod";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

export const PersonSchema = z.object({
  id: IdSchema,
  aliasCode: z.string().min(1),
  displayName: z.string().min(1),
  ageBand: z.string().min(1),
  gender: z.string().min(1),
  isSynthetic: z.literal(true),
  languagePreference: z.string().nullable(),
  hasDisability: z.boolean(),
  isFirstTimeOffender: z.boolean(),
  economicallyWeakerSection: z.boolean(),
  emergencyContactAlias: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PersonDto = z.infer<typeof PersonSchema>;

/**
 * Guardrail enforcement (spec §1.5): "Add a check/validation: isSynthetic
 * must be true. Reject writes otherwise." `z.literal(true)` makes any
 * value other than `true` a validation error rather than silently
 * coercing it — an explicit `isSynthetic: false` in a request body is
 * rejected with VALIDATION_ERROR before it ever reaches the database.
 * The Postgres CHECK constraint added in migration
 * 20260920170300_person_is_synthetic_check is the second, independent
 * layer of defense (see apps/api/prisma/schema.prisma).
 */
export const PersonCreateInputSchema = z
  .object({
    aliasCode: z.string().min(1),
    displayName: z.string().min(1),
    ageBand: z.string().min(1),
    gender: z.string().min(1),
    isSynthetic: z.literal(true).default(true),
    languagePreference: z.string().min(1).optional(),
    hasDisability: z.boolean().default(false),
    isFirstTimeOffender: z.boolean().default(false),
    economicallyWeakerSection: z.boolean().default(false),
    emergencyContactAlias: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();
export type PersonCreateInput = z.infer<typeof PersonCreateInputSchema>;

export const PersonUpdateInputSchema = PersonCreateInputSchema.partial().strict();
export type PersonUpdateInput = z.infer<typeof PersonUpdateInputSchema>;
