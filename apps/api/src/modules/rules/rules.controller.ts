import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as rulesService from "./rules.service.js";

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

export async function listRulesHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await rulesService.listRules());
}

export async function createRuleHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const rule = await rulesService.createRule(
    { ...user, email: user.email },
    req.body as Parameters<typeof rulesService.createRule>[1],
    requestContext(req),
  );
  ok(req, res, rule, 201);
}

export async function updateRuleHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const rule = await rulesService.updateRule(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof rulesService.updateRule>[2],
    requestContext(req),
  );
  ok(req, res, rule);
}

export async function toggleRuleHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const rule = await rulesService.toggleRule(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof rulesService.toggleRule>[2],
    requestContext(req),
  );
  ok(req, res, rule);
}

export async function getRuleVersionsHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await rulesService.getRuleVersions(req.params.id as string));
}

export async function getRulesetConfigHandler(req: Request, res: Response): Promise<void> {
  ok(req, res, await rulesService.getRulesetConfig());
}

export async function updateRulesetConfigHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const config = await rulesService.updateRulesetConfig(
    { ...user, email: user.email },
    req.body as Parameters<typeof rulesService.updateRulesetConfig>[1],
    requestContext(req),
  );
  ok(req, res, config);
}

export async function simulateRulesetHandler(req: Request, res: Response): Promise<void> {
  const result = await rulesService.simulateRuleset(
    req.body as Parameters<typeof rulesService.simulateRuleset>[0],
  );
  ok(req, res, result);
}

export async function recomputeAllHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const result = await rulesService.recomputeAllCases(
    { ...user, email: user.email },
    requestContext(req),
    "USER",
  );
  ok(req, res, result);
}
