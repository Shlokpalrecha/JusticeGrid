import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { IdentityIndex, sha256Hex, type IdentityRecord } from "@justicegrid/rules-engine";
import { AppError } from "@justicegrid/shared";
import { prisma } from "../../lib/prisma.js";
import { loadAccessibleCase } from "../../lib/caseAccess.js";
import { writeAuditEntry, type AuditRequestContext } from "../../lib/audit.js";
import type { QueueActor } from "../priority/priority.service.js";
import type {
  IdentityInput,
  IngestInput,
  DecisionInput,
  RecordEditInput,
} from "./systems.schemas.js";
type Tx = Prisma.TransactionClient;
type IndexCache = { generation: number; scopeStamp: string; index: IdentityIndex };
const caches = new Map<string, IndexCache>();
function recordScope(actor: QueueActor): Prisma.SystemRecordWhereInput {
  return actor.role === "LEGAL_PROFESSIONAL"
    ? {
        OR: [
          { case: { assignedToId: actor.id, deletedAt: null } },
          { caseId: null, createdById: actor.id },
        ],
      }
    : { OR: [{ caseId: null }, { case: { deletedAt: null } }] };
}
async function lockedIndex(tx: Tx, actor: QueueActor) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('systems-identity'))`;
  const generation = await tx.systemGeneration.upsert({
    where: { id: "identity" },
    create: { id: "identity" },
    update: {},
  });
  const accessibleCases = await tx.case.findMany({
    where: {
      ...(actor.role === "LEGAL_PROFESSIONAL" ? { assignedToId: actor.id } : {}),
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const scopeStamp = sha256Hex(actor.role + JSON.stringify(accessibleCases));
  let cache = caches.get(actor.id);
  if (!cache || cache.generation !== generation.revision || cache.scopeStamp !== scopeStamp) {
    const index = new IdentityIndex();
    let cursor: string | undefined;
    while (true) {
      const rows = await tx.systemRecord.findMany({
        where: { AND: [recordScope(actor), ...(cursor ? [{ id: { gt: cursor } }] : [])] },
        orderBy: { id: "asc" },
        take: 500,
      });
      for (const row of rows) index.upsert(row);
      if (rows.length < 500) break;
      cursor = rows[rows.length - 1]!.id;
    }
    cache = { generation: generation.revision, scopeStamp, index };
    caches.delete(actor.id);
    if (caches.size >= 4) caches.delete(caches.keys().next().value!);
    caches.set(actor.id, cache);
  }
  return cache;
}
async function accessible(tx: Tx, actor: QueueActor, id: string) {
  const row = await tx.systemRecord.findFirst({ where: { AND: [{ id }, recordScope(actor)] } });
  if (!row) throw new AppError("NOT_FOUND", "Identity record unavailable in your scope.");
  return row;
}
export async function listRecords(actor: QueueActor) {
  return prisma.systemRecord.findMany({
    where: recordScope(actor),
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      outgoing: { where: { right: recordScope(actor) } },
      incoming: { where: { left: recordScope(actor) } },
    },
  });
}
export async function findCandidates(actor: QueueActor, input: z.infer<typeof IdentityInput>) {
  if (input.caseId) await loadAccessibleCase(prisma, actor, input.caseId);
  return prisma.$transaction(
    async (tx) => {
      const cache = await lockedIndex(tx, actor);
      return {
        ...cache.index.match({ id: "", ...input }),
        index: cache.index.stats(),
        generation: cache.generation,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
export async function ingestRecords(
  actor: QueueActor,
  body: z.infer<typeof IngestInput>,
  request: AuditRequestContext,
) {
  let touched: IndexCache | undefined;
  try {
    const committed = await prisma.$transaction(
      async (tx) => {
        const cache = await lockedIndex(tx, actor),
          results = [];
        touched = cache;
        for (const input of body.records) {
          if (input.caseId) await loadAccessibleCase(tx, actor, input.caseId);
          cache.generation = -1;
          const candidates = cache.index.match({ id: "", ...input });
          const record = await tx.systemRecord.create({
            data: { ...input, createdById: actor.id },
          });
          cache.index.upsert(record);
          results.push({ record, candidates });
          await writeAuditEntry(tx, actor, request, {
            action: "CREATE",
            entityType: "SystemRecord",
            entityId: record.id,
            entityLabel: record.name,
            summary: `Stream ingestion: ${body.reason}`,
            after: {
              record,
              candidates: candidates.matches.map((m) => m.id),
              overflow: candidates.overflow,
            },
          });
        }
        const generation = await tx.systemGeneration.update({
          where: { id: "identity" },
          data: { revision: { increment: 1 } },
        });

        return { results, generation: generation.revision, index: cache.index.stats() };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    if (touched) touched.generation = committed.generation;
    return committed;
  } catch (error) {
    caches.delete(actor.id);
    throw error;
  }
}
export async function editRecord(
  actor: QueueActor,
  id: string,
  body: z.infer<typeof RecordEditInput>,
  request: AuditRequestContext,
) {
  let touched: IndexCache | undefined,
    committedGeneration = -1;
  try {
    const committed = await prisma.$transaction(
      async (tx) => {
        const cache = await lockedIndex(tx, actor),
          old = await accessible(tx, actor, id);
        if (old.revision !== body.expectedRevision)
          throw new AppError("CONFLICT", "Identity record changed; reload it.");
        if (old.kind !== body.record.kind)
          throw new AppError(
            "VALIDATION_ERROR",
            "Record kind is immutable; ingest a new source record for a different kind.",
          );
        if (body.record.caseId) await loadAccessibleCase(tx, actor, body.record.caseId);
        touched = cache;
        cache.generation = -1;
        const record = await tx.systemRecord.update({
          where: { id },
          data: { ...body.record, revision: { increment: 1 } },
        });
        cache.index.upsert(record);
        committedGeneration = (
          await tx.systemGeneration.update({
            where: { id: "identity" },
            data: { revision: { increment: 1 } },
          })
        ).revision;
        await writeAuditEntry(tx, actor, request, {
          action: "UPDATE",
          entityType: "SystemRecord",
          entityId: id,
          entityLabel: record.name,
          summary: body.reason,
          before: old,
          after: record,
        });
        return record;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    if (touched) touched.generation = committedGeneration;
    return committed;
  } catch (error) {
    caches.delete(actor.id);
    throw error;
  }
}
export async function decideIdentity(
  actor: QueueActor,
  body: z.infer<typeof DecisionInput>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('systems-identity'))`;
      const ids = [body.leftId, body.rightId].sort();
      if (ids[0] === ids[1])
        throw new AppError("VALIDATION_ERROR", "A record cannot link to itself.");
      const [left, right] = await Promise.all(ids.map((id) => accessible(tx, actor, id)));
      if (left!.kind !== right!.kind)
        throw new AppError("VALIDATION_ERROR", "Identity decisions require matching record kinds.");
      const old = await tx.identityDecision.findUnique({
        where: { leftId_rightId: { leftId: ids[0]!, rightId: ids[1]! } },
      });
      if ((old?.revision ?? -1) !== body.expectedRevision)
        throw new AppError("CONFLICT", "Identity relationship changed; reload it.");
      if (body.disposition === "SPLIT" && old?.disposition !== "LINK")
        throw new AppError("VALIDATION_ERROR", "Only a linked relationship can be split.");
      const row = await tx.identityDecision.upsert({
        where: { leftId_rightId: { leftId: ids[0]!, rightId: ids[1]! } },
        create: {
          leftId: ids[0]!,
          rightId: ids[1]!,
          disposition: body.disposition,
          reason: body.reason,
        },
        update: { disposition: body.disposition, reason: body.reason, revision: { increment: 1 } },
      });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "IdentityDecision",
        entityId: row.id,
        entityLabel: "Reviewed identity relationship",
        summary: body.reason,
        before: old,
        after: row,
      });
      return row;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
export type { IdentityRecord };
