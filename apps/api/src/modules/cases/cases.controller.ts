import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { buildPageMeta } from "../../lib/pagination.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as casesService from "./cases.service.js";

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

export async function listCasesHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  // req.query has already been validated + coerced by validateQuery
  // middleware against CaseFilterQuerySchema.
  const filter = req.query as unknown as Parameters<typeof casesService.listCases>[1];
  const { items, total } = await casesService.listCases({ ...user, email: user.email }, filter);
  const response: ApiSuccessResponse<typeof items> = {
    success: true,
    data: items,
    meta: buildPageMeta(getRequestId(req), filter, total),
  };
  res.status(200).json(response);
}

export async function getCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const caseAggregate = await casesService.getCaseAggregate(user, req.params.id as string);
  ok(req, res, caseAggregate);
}

export async function createCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const created = await casesService.createCase(
    { ...user, email: user.email },
    req.body as Parameters<typeof casesService.createCase>[1],
    requestContext(req),
  );
  ok(req, res, created, 201);
}

export async function updateCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const updated = await casesService.updateCase(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof casesService.updateCase>[2],
    requestContext(req),
  );
  ok(req, res, updated);
}

export async function assignCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const updated = await casesService.assignCase(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof casesService.assignCase>[2],
    requestContext(req),
  );
  ok(req, res, updated);
}

export async function unassignCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const updated = await casesService.unassignCase(
    { ...user, email: user.email },
    req.params.id as string,
    requestContext(req),
  );
  ok(req, res, updated);
}

export async function archiveCaseHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const updated = await casesService.archiveCase(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof casesService.archiveCase>[2],
    requestContext(req),
  );
  ok(req, res, updated);
}

export async function listChargesHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const charges = await casesService.listCharges(user, req.params.id as string);
  ok(req, res, charges);
}

export async function addChargeHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const charge = await casesService.addCharge(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof casesService.addCharge>[2],
    requestContext(req),
  );
  ok(req, res, charge, 201);
}

export async function addCaseNoteHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const note = await casesService.addCaseNote(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof casesService.addCaseNote>[2],
    requestContext(req),
  );
  ok(req, res, note, 201);
}

export async function getCaseTimelineHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const timeline = await casesService.getCaseTimeline(user, req.params.id as string);
  ok(req, res, timeline);
}

export async function getCaseAuditHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const entries = await casesService.getCaseAudit(user, req.params.id as string);
  ok(req, res, entries);
}
