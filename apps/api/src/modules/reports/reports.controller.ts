import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as reportsService from "./reports.service.js";

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

function ok<T>(req: Request, res: Response, data: T): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function pendingByUserHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await reportsService.getPendingByUser(requireUser(req)));
}

export async function upcomingHearingsHandler(req: Request, res: Response): Promise<void> {
  const { days } = req.query as unknown as { days: number };
  ok(req, res, await reportsService.getUpcomingHearings(requireUser(req), days));
}

export async function overdueActionsHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await reportsService.getOverdueActions(requireUser(req)));
}

export async function priorityDistributionHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await reportsService.getPriorityDistributionReport(requireUser(req)));
}

export async function completedHandler(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query as unknown as { from?: string; to?: string };
  ok(req, res, await reportsService.getCompleted(requireUser(req), from, to));
}

export async function caseAgingHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await reportsService.getCaseAging(requireUser(req)));
}

export async function ruleTriggerFrequencyHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await reportsService.getActionFrequency(requireUser(req)));
}

/**
 * `GET /reports/:name/export.csv` (spec §7). Every export is itself an
 * audited `EXPORT` event (spec §8.9's general "sensitive data leaving
 * the system should be traceable" principle, applied the same way
 * `GET /audit/export.csv` does) — written in its own transaction since,
 * unlike a business mutation, a read-only export has no other write to
 * couple it to.
 */
export async function reportExportCsvHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { name } = req.params as unknown as {
    name: Parameters<typeof reportsService.getReportCsv>[1];
  };
  const query = req.query as unknown as Parameters<typeof reportsService.getReportCsv>[2];

  const csv = await reportsService.getReportCsv(user, name, query);

  await prisma.$transaction((tx) =>
    writeAuditEntry(tx, user, requestContext(req), {
      action: "EXPORT",
      entityType: "Report",
      entityLabel: name,
      summary: `${user.email} exported the "${name}" report as CSV`,
    }),
  );

  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.csv"`);
  res.send(csv);
}
