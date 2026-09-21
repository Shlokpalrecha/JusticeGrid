import type { AuditLogDto, AuditLogFilter } from "@justicegrid/shared";
import { AppError } from "@justicegrid/shared";
import { toAuditLogDto } from "../../lib/audit.js";
import { toCsv } from "../../lib/csv.js";
import { toSkipTake } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";

/** `GET /audit` (spec §7, ADMIN/AUDITOR only — enforced at the route
 * level via `requireCapability("VIEW_AUDIT_LOG", { unscoped: true })`,
 * matching `GET /audit/verify-chain`'s existing gate). Unlike
 * `cases.service.ts`'s `getCaseAudit`, there is no per-actor ownership
 * scoping here — this route is unscoped by design (only ADMIN/AUDITOR
 * reach it at all). */
export async function listAuditLog(
  filter: AuditLogFilter,
): Promise<{ items: AuditLogDto[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filter.actor) where.actorId = filter.actor;
  if (filter.action) where.action = filter.action;
  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.entityId) where.entityId = filter.entityId;
  if (filter.success !== undefined) where.success = filter.success;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: new Date(filter.from) } : {}),
      ...(filter.to ? { lte: new Date(filter.to) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { sequence: "desc" },
      ...toSkipTake(filter),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items: rows.map(toAuditLogDto), total };
}

export async function getAuditLogEntry(id: string): Promise<AuditLogDto> {
  const row = await prisma.auditLog.findUnique({ where: { id } });
  if (!row) throw new AppError("NOT_FOUND", "Audit log entry not found.");
  return toAuditLogDto(row);
}

/** `GET /audit/export.csv` (spec §7): same filters as the list endpoint,
 * unpaginated (a CSV export is meant to capture everything matching the
 * filter, not one page of it). */
export async function exportAuditLogCsv(
  filter: Omit<AuditLogFilter, "page" | "pageSize">,
): Promise<string> {
  const where: Record<string, unknown> = {};
  if (filter.actor) where.actorId = filter.actor;
  if (filter.action) where.action = filter.action;
  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.entityId) where.entityId = filter.entityId;
  if (filter.success !== undefined) where.success = filter.success;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: new Date(filter.from) } : {}),
      ...(filter.to ? { lte: new Date(filter.to) } : {}),
    };
  }

  const rows = await prisma.auditLog.findMany({ where, orderBy: { sequence: "asc" } });

  return toCsv(
    [
      "Sequence",
      "Timestamp",
      "Actor Email",
      "Actor Role",
      "Action",
      "Entity Type",
      "Entity ID",
      "Entity Label",
      "Summary",
      "Success",
      "Failure Reason",
      "Hash",
    ],
    rows.map((r) => [
      r.sequence.toString(),
      r.createdAt.toISOString(),
      r.actorEmail,
      r.actorRole,
      r.action,
      r.entityType,
      r.entityId,
      r.entityLabel,
      r.summary,
      r.success,
      r.failureReason,
      r.hash,
    ]),
  );
}
