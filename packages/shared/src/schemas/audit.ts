import { z } from "zod";
import { AuditActionSchema, RoleSchema } from "../enums.js";
import { PaginationQuerySchema } from "../envelope.js";
import { BooleanQueryParamSchema, IdSchema, IsoDateTimeSchema } from "./common.js";

/**
 * Wire shape of an AuditLog row. `sequence` is a Postgres `bigint`
 * (Prisma `BigInt`); `JSON.stringify` cannot serialize a native BigInt,
 * so the API layer converts it to a decimal string before it ever
 * reaches this schema — represented here as `z.string()` rather than
 * `z.number()` to avoid silent precision loss on very large sequences.
 */
export const AuditLogSchema = z.object({
  id: IdSchema,
  sequence: z.string(),
  actorId: IdSchema.nullable(),
  actorEmail: z.string(),
  actorRole: RoleSchema.nullable(),
  action: AuditActionSchema,
  entityType: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string(),
  summary: z.string(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  changedFields: z.array(z.string()),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string(),
  success: z.boolean(),
  failureReason: z.string().nullable(),
  previousHash: z.string(),
  hash: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type AuditLogDto = z.infer<typeof AuditLogSchema>;

/** Result of walking the audit hash chain end to end (spec §5:
 * `GET /api/v1/audit/verify-chain`). */
export const AuditChainVerificationSchema = z.object({
  intact: z.boolean(),
  entriesChecked: z.number().int(),
  firstBreakAtSequence: z.string().nullable(),
});
export type AuditChainVerification = z.infer<typeof AuditChainVerificationSchema>;

export const AuditLogFilterSchema = PaginationQuerySchema.extend({
  actor: IdSchema.optional(),
  action: AuditActionSchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
  success: BooleanQueryParamSchema.optional(),
}).strict();
export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>;
