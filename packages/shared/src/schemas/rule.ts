import { z } from "zod";
import { ConditionTypeSchema, RuleCategorySchema } from "../enums.js";
import { IdSchema, IsoDateTimeSchema } from "./common.js";

/**
 * A rule's condition parameters. Matches `RuleDefinition.params` in
 * packages/rules-engine's contract exactly (`Record<string, number |
 * string | boolean | string[]>`, spec §6.1) — this is the API-facing
 * mirror of that pure-package type, not a re-export of it (rules-engine
 * imports nothing, including this package; see spec §4's architectural
 * rule and packages/rules-engine/package.json's zero dependencies).
 */
export const RuleParamsSchema = z.record(
  z.string(),
  z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]),
);
export type RuleParams = z.infer<typeof RuleParamsSchema>;

export const RuleSchema = z.object({
  id: IdSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: RuleCategorySchema,
  conditionType: ConditionTypeSchema,
  params: RuleParamsSchema,
  weight: z.number().int(),
  isEnabled: z.boolean(),
  displayTemplate: z.string().min(1),
  severityHint: z.string().nullable(),
  version: z.number().int(),
  createdById: IdSchema,
  updatedById: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type RuleDto = z.infer<typeof RuleSchema>;

export const RuleCreateInputSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    category: RuleCategorySchema,
    conditionType: ConditionTypeSchema,
    params: RuleParamsSchema,
    weight: z.number().int(),
    isEnabled: z.boolean().default(true),
    displayTemplate: z.string().min(1),
    severityHint: z.string().optional(),
  })
  .strict();
export type RuleCreateInput = z.infer<typeof RuleCreateInputSchema>;

export const RuleUpdateInputSchema = RuleCreateInputSchema.omit({ code: true })
  .partial()
  .extend({ changeReason: z.string().optional() })
  .strict();
export type RuleUpdateInput = z.infer<typeof RuleUpdateInputSchema>;

export const RuleToggleInputSchema = z
  .object({
    isEnabled: z.boolean(),
    changeReason: z.string().optional(),
  })
  .strict();
export type RuleToggleInput = z.infer<typeof RuleToggleInputSchema>;

/** Append-only rule change history (spec §5's RuleVersion). */
export const RuleVersionSchema = z.object({
  id: IdSchema,
  ruleId: IdSchema,
  version: z.number().int(),
  snapshotJson: z.unknown(),
  changedById: IdSchema,
  changeReason: z.string().nullable(),
  changedAt: IsoDateTimeSchema,
});
export type RuleVersionDto = z.infer<typeof RuleVersionSchema>;

/**
 * Versioned ruleset thresholds (spec §6.4). Only one row is ever active;
 * changing thresholds creates a new version rather than mutating this one
 * — so there is deliberately no "update" input schema, only "create a new
 * active version".
 */
export const RulesetConfigSchema = z.object({
  id: IdSchema,
  version: z.number().int(),
  highThreshold: z.number().int(),
  mediumThreshold: z.number().int(),
  maxScoreCap: z.number().int().nullable(),
  isActive: z.boolean(),
  activatedAt: IsoDateTimeSchema,
  activatedById: IdSchema,
  notes: z.string().nullable(),
});
export type RulesetConfigDto = z.infer<typeof RulesetConfigSchema>;

export const RulesetConfigCreateInputSchema = z
  .object({
    highThreshold: z.number().int().positive(),
    mediumThreshold: z.number().int().positive(),
    maxScoreCap: z.number().int().positive().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine((v) => v.mediumThreshold < v.highThreshold, {
    message: "mediumThreshold must be less than highThreshold",
    path: ["mediumThreshold"],
  });
export type RulesetConfigCreateInput = z.infer<typeof RulesetConfigCreateInputSchema>;
