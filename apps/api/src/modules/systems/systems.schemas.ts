import { z } from "zod";
const text = z.string().trim().min(1).max(500),
  key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/);
export const IdentityInput = z
  .object({
    kind: z.enum(["FILING", "PERSON", "EVIDENCE"]),
    name: z.string().trim().min(1).max(160),
    jurisdiction: text,
    reference: z.string().trim().max(160).default(""),
    eventDate: z.string().date().nullable().default(null),
    caseId: z.string().min(1).nullable().default(null),
  })
  .strict();
export const IngestInput = z
  .object({ records: z.array(IdentityInput).min(1).max(100), reason: text })
  .strict();
export const RecordEditInput = z
  .object({ expectedRevision: z.number().int().nonnegative(), record: IdentityInput, reason: text })
  .strict();
export const DecisionInput = z
  .object({
    leftId: text,
    rightId: text,
    expectedRevision: z.number().int().min(-1),
    disposition: z.enum(["LINK", "DISTINCT", "SPLIT"]),
    reason: text,
  })
  .strict();
export const GraphInput = z
  .object({
    expectedRevision: z.number().int().min(-1),
    nodes: z
      .array(z.object({ key, title: text }).strict())
      .min(1)
      .max(2000),
    edges: z.array(z.object({ from: key, to: key }).strict()).max(10000),
    reason: text,
  })
  .strict();
export const NodeTransition = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(["OPEN", "DONE"]),
    evidence: text,
  })
  .strict();
export const RuleEvidence = z
  .object({
    expectedRevision: z.number().int().min(-1),
    offenseSeverityIndex: z.number().min(0).max(10).nullable(),
    bailEligibility: z.boolean().nullable(),
    basis: text,
  })
  .strict();

export const ExpressionInput = z
  .object({
    expression: z.string().min(1).max(8000),
    context: z
      .record(z.union([z.number().finite(), z.boolean(), z.string().max(500), z.null()]))
      .default({}),
    resultType: z.enum(["boolean", "number"]).default("boolean"),
  })
  .strict();
