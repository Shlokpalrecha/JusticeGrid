import { createHash } from "node:crypto";
import {
  Prisma,
  type AuditAction,
  type AuditLog,
  type PrismaClient,
  type Role,
} from "@prisma/client";
import type { AuditLogDto } from "@justicegrid/shared";

/**
 * Append-only, hash-chained audit log (spec §5, §8.9). No update or
 * delete route is ever exposed for AuditLog (enforced by simply never
 * writing one, in Phase 6's audit module) — this file is the only place
 * that ever mutates the table.
 *
 * hash = sha256(sequence | actorId | action | entityType | entityId |
 *               createdAt | canonical(beforeJson) | canonical(afterJson) |
 *               previousHash)
 *
 * `sequence` is a Postgres `bigserial` (spec: "monotonic"), assigned
 * atomically by the database itself — safe under concurrent writers
 * without any application-level locking. The hash, which *depends on*
 * that assigned sequence, is necessarily computed in a second step after
 * the row exists: insert first (reserving the sequence), then compute
 * and patch in previousHash/hash, both within the same transaction as
 * the business mutation this entry documents (spec §8.9's "audit write
 * happens in the same transaction as the mutation" — if either half
 * fails, the whole transaction rolls back, so an audit entry can never
 * be silently lost, though it may block the mutation from being
 * durable). This is internal plumbing inside one atomic transaction, not
 * an exposed UPDATE endpoint.
 *
 * Writers hold a transaction-scoped advisory mutex before reserving sequence
 * numbers; concurrent appends cannot fork either hash chain. Activity_Log
 * rows are final on INSERT and a database trigger rejects UPDATE/DELETE.
 */

const GENESIS_HASH = "0".repeat(64);

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

interface HashInputRow {
  sequence: bigint;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
  beforeJson: unknown;
  afterJson: unknown;
  previousHash: string;
}

function computeRowHash(row: HashInputRow): string {
  const payload = [
    row.sequence.toString(),
    row.actorId ?? "",
    row.action,
    row.entityType,
    row.entityId ?? "",
    row.createdAt.toISOString(),
    canonicalJson(row.beforeJson ?? null),
    canonicalJson(row.afterJson ?? null),
    row.previousHash,
  ].join("|");
  return sha256Hex(payload);
}

/** Shallow diff of top-level keys between two plain-object snapshots,
 * comparing values via canonical JSON so nested changes are still
 * detected. Returns a sorted, deduplicated field-name list. */
export function diffChangedFields(before: unknown, after: unknown): string[] {
  const beforeObj = isPlainObject(before) ? before : {};
  const afterObj = isPlainObject(after) ? after : {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (canonicalJson(beforeObj[key]) !== canonicalJson(afterObj[key])) {
      changed.push(key);
    }
  }
  return changed.sort();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface AuditActor {
  id: string | null;
  email: string;
  role: Role | null;
}

export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface WriteAuditEntryInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  entityLabel: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  success?: boolean;
  failureReason?: string;
}

/**
 * Writes one hash-chained audit entry. `tx` must be the same
 * `Prisma.TransactionClient` the caller's business mutation runs in, so
 * the two commit or roll back together.
 */
export async function writeAuditEntry(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  request: AuditRequestContext,
  input: WriteAuditEntryInput,
): Promise<AuditLog> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('justicegrid-audit-chain'))`;
  const before: unknown = input.before == null ? null : JSON.parse(JSON.stringify(input.before));
  const after: unknown = input.after == null ? null : JSON.parse(JSON.stringify(input.after));
  const changedFields = diffChangedFields(before, after);

  const created = await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel,
      summary: input.summary,
      beforeJson: before as Prisma.InputJsonValue,
      afterJson: after as Prisma.InputJsonValue,
      changedFields,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      requestId: request.requestId,
      success: input.success ?? true,
      failureReason: input.failureReason ?? null,
      // Placeholders — the DB row must exist before we know its
      // atomically-assigned `sequence`, which the real hash depends on.
      previousHash: "",
      hash: "",
    },
  });

  const previousRow = await tx.auditLog.findFirst({
    where: { sequence: { lt: created.sequence } },
    orderBy: { sequence: "desc" },
    select: { hash: true },
  });
  const previousHash = previousRow?.hash ?? GENESIS_HASH;

  const hash = computeRowHash({
    sequence: created.sequence,
    actorId: actor.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    createdAt: created.createdAt,
    beforeJson: before,
    afterJson: after,
    previousHash,
  });

  const finalized = await tx.auditLog.update({
    where: { id: created.id },
    data: { previousHash, hash },
  });
  const previous = await tx.activityLedger.findFirst({
    orderBy: { sequence: "desc" },
    select: { hash: true },
  });
  const sequence = (
    await tx.$queryRaw<
      { value: bigint }[]
    >`SELECT nextval(pg_get_serial_sequence('"Activity_Log"','sequence')) AS value`
  )[0]!.value;
  const timestamp = new Date();
  const ledger = {
    sequence: sequence.toString(),
    userId: actor.id,
    timestamp: timestamp.toISOString(),
    actionType: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: before,
    newValue: after,
    requestId: request.requestId,
    previousHash: previous?.hash ?? GENESIS_HASH,
  };
  await tx.activityLedger.create({
    data: {
      ...ledger,
      sequence,
      timestamp,
      oldValue: before === null ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
      newValue: after === null ? Prisma.JsonNull : (after as Prisma.InputJsonValue),
      hash: sha256Hex(canonicalJson(ledger)),
    },
  });
  return finalized;
}

export interface ChainVerificationResult {
  intact: boolean;
  entriesChecked: number;
  firstBreakAtSequence: string | null;
}

/** Walks the entire audit chain in sequence order, recomputing and
 * comparing each row's hash — spec §5's `GET /audit/verify-chain`. */
export async function verifyAuditChain(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<ChainVerificationResult> {
  const entries = await client.auditLog.findMany({ orderBy: { sequence: "asc" } });

  let previousHash = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.previousHash !== previousHash) {
      return {
        intact: false,
        entriesChecked: entries.length,
        firstBreakAtSequence: entry.sequence.toString(),
      };
    }
    const recomputed = computeRowHash({
      sequence: entry.sequence,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      createdAt: entry.createdAt,
      beforeJson: entry.beforeJson,
      afterJson: entry.afterJson,
      previousHash,
    });
    if (recomputed !== entry.hash) {
      return {
        intact: false,
        entriesChecked: entries.length,
        firstBreakAtSequence: entry.sequence.toString(),
      };
    }
    previousHash = entry.hash;
  }

  return { intact: true, entriesChecked: entries.length, firstBreakAtSequence: null };
}

/** Shared AuditLog row → wire DTO mapper (spec §5), reused by every
 * audit-reading call site (`cases.service.ts`'s `GET /cases/:id/audit`,
 * `audit.service.ts`'s `GET /audit`/`GET /audit/:id`) so the mapping —
 * notably `sequence`'s BigInt → decimal-string conversion — never
 * drifts between them. */
export function toAuditLogDto(e: AuditLog): AuditLogDto {
  return {
    id: e.id,
    sequence: e.sequence.toString(),
    actorId: e.actorId,
    actorEmail: e.actorEmail,
    actorRole: e.actorRole,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    entityLabel: e.entityLabel,
    summary: e.summary,
    beforeJson: e.beforeJson,
    afterJson: e.afterJson,
    changedFields: e.changedFields,
    ipAddress: e.ipAddress,
    userAgent: e.userAgent,
    requestId: e.requestId,
    success: e.success,
    failureReason: e.failureReason,
    previousHash: e.previousHash,
    hash: e.hash,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Cursor-streamed verification has bounded memory, independent of ledger size. */
export async function verifyActivityLedger(client: PrismaClient | Prisma.TransactionClient) {
  // Pin the visible head so a stream of concurrent appends cannot prolong verification forever.
  const head = await client.activityLedger.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const upper = head?.sequence ?? 0n;
  let cursor = 0n,
    previousHash = GENESIS_HASH,
    entriesChecked = 0;
  while (true) {
    const rows = await client.activityLedger.findMany({
      where: { sequence: { gt: cursor, lte: upper } },
      orderBy: { sequence: "asc" },
      take: 500,
    });
    for (const row of rows) {
      const { hash, ...fields } = row;
      const payload = {
        ...fields,
        sequence: row.sequence.toString(),
        timestamp: row.timestamp.toISOString(),
      };
      if (row.previousHash !== previousHash || sha256Hex(canonicalJson(payload)) !== hash)
        return { intact: false, entriesChecked, firstBreakAtSequence: row.sequence.toString() };
      previousHash = hash;
      cursor = row.sequence;
      entriesChecked++;
    }
    if (rows.length < 500) return { intact: true, entriesChecked, firstBreakAtSequence: null };
  }
}
