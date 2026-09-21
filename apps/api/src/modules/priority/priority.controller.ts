import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { buildPageMeta } from "../../lib/pagination.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as priorityService from "./priority.service.js";

function requestContext(req: Request): AuditRequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    requestId: getRequestId(req),
  };
}

function requireUser(req: Request) {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  return req.user;
}

function ok<T>(req: Request, res: Response, data: T, status = 200): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: { requestId: getRequestId(req) },
  };
  res.status(status).json(response);
}

export async function getQueueHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const filter = req.query as unknown as Parameters<typeof priorityService.getQueue>[1];
  const { items, total } = await priorityService.getQueue({ ...user, email: user.email }, filter);
  const response: ApiSuccessResponse<typeof items> = {
    success: true,
    data: items,
    meta: buildPageMeta(getRequestId(req), filter, total),
  };
  res.status(200).json(response);
}

export async function getCasePriorityHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const evaluation = await priorityService.getCasePriority(
    { ...user, email: user.email },
    req.params.caseId as string,
  );
  ok(req, res, evaluation);
}

export async function getCasePriorityHistoryHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const history = await priorityService.getCasePriorityHistory(
    { ...user, email: user.email },
    req.params.caseId as string,
  );
  ok(req, res, history);
}

export async function recomputeCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const evaluation = await priorityService.recomputeCase(
    { ...user, email: user.email },
    req.params.caseId as string,
    requestContext(req),
  );
  ok(req, res, evaluation);
}

export async function getDistributionHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const distribution = await priorityService.getDistribution({ ...user, email: user.email });
  ok(req, res, distribution);
}
