import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as documentsService from "./documents.service.js";

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

export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const docs = await documentsService.listDocuments(
    { ...user, email: user.email },
    req.params.id as string,
  );
  ok(req, res, docs);
}

export async function addDocumentHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const doc = await documentsService.addDocument(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof documentsService.addDocument>[2],
    requestContext(req),
  );
  ok(req, res, doc, 201);
}

export async function updateDocumentHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const doc = await documentsService.updateDocument(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof documentsService.updateDocument>[2],
    requestContext(req),
  );
  ok(req, res, doc);
}

export async function verifyDocumentHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const doc = await documentsService.verifyDocument(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof documentsService.verifyDocument>[2],
    requestContext(req),
  );
  ok(req, res, doc);
}

export async function applyChecklistHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const docs = await documentsService.applyChecklist(
    { ...user, email: user.email },
    req.params.id as string,
    requestContext(req),
  );
  ok(req, res, docs, 201);
}
