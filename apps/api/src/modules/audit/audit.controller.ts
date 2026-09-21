import type { Request, Response } from "express";
import {
  AppError,
  type ApiSuccessResponse,
  type AuditChainVerification,
  type AuditLogFilter,
} from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { verifyAuditChain, writeAuditEntry } from "../../lib/audit.js";
import { buildPageMeta } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as auditService from "./audit.service.js";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  return req.user;
}

function requestContext(req: Request): AuditRequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    requestId: getRequestId(req),
  };
}

export async function verifyChainHandler(req: Request, res: Response): Promise<void> {
  const result = await verifyAuditChain(prisma);
  const data: AuditChainVerification = {
    intact: result.intact,
    entriesChecked: result.entriesChecked,
    firstBreakAtSequence: result.firstBreakAtSequence,
  };
  const response: ApiSuccessResponse<AuditChainVerification> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function listAuditLogHandler(req: Request, res: Response): Promise<void> {
  const filter = req.query as unknown as AuditLogFilter;
  const { items, total } = await auditService.listAuditLog(filter);
  const response: ApiSuccessResponse<typeof items> = {
    success: true,
    data: items,
    meta: buildPageMeta(getRequestId(req), filter, total),
  };
  res.status(200).json(response);
}

export async function getAuditLogEntryHandler(req: Request, res: Response): Promise<void> {
  const entry = await auditService.getAuditLogEntry(req.params.id as string);
  const response: ApiSuccessResponse<typeof entry> = {
    success: true,
    data: entry,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function exportAuditLogCsvHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const filter = req.query as unknown as AuditLogFilter;
  const csv = await auditService.exportAuditLogCsv(filter);

  await prisma.$transaction((tx) =>
    writeAuditEntry(tx, user, requestContext(req), {
      action: "EXPORT",
      entityType: "AuditLog",
      entityLabel: "Audit log",
      summary: `${user.email} exported the audit log as CSV`,
    }),
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"');
  res.status(200).send(csv);
}
