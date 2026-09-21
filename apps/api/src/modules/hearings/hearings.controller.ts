import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as hearingsService from "./hearings.service.js";

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

export async function listHearingsHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const hearings = await hearingsService.listHearingsForCase(
    { ...user, email: user.email },
    req.params.id as string,
  );
  ok(req, res, hearings);
}

export async function createHearingHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const hearing = await hearingsService.createHearing(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof hearingsService.createHearing>[2],
    requestContext(req),
  );
  ok(req, res, hearing, 201);
}

export async function updateHearingHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const hearing = await hearingsService.updateHearing(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof hearingsService.updateHearing>[2],
    requestContext(req),
  );
  ok(req, res, hearing);
}

export async function markOrderReviewedHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const hearing = await hearingsService.markOrderReviewed(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof hearingsService.markOrderReviewed>[2],
    requestContext(req),
  );
  ok(req, res, hearing);
}

export async function listUpcomingHearingsHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const days = (req.query as unknown as { days: number }).days;
  const hearings = await hearingsService.listUpcomingHearings({ ...user, email: user.email }, days);
  ok(req, res, hearings);
}
