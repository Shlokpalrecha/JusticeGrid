import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { buildPageMeta } from "../../lib/pagination.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as tasksService from "./tasks.service.js";

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

export async function listTasksHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const filter = req.query as unknown as Parameters<typeof tasksService.listTasks>[1];
  const { items, total } = await tasksService.listTasks({ ...user, email: user.email }, filter);
  const response: ApiSuccessResponse<typeof items> = {
    success: true,
    data: items,
    meta: buildPageMeta(getRequestId(req), filter, total),
  };
  res.status(200).json(response);
}

export async function getMyTaskQueueHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const tasks = await tasksService.getMyTaskQueue({ ...user, email: user.email });
  ok(req, res, tasks);
}

export async function createTaskHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const task = await tasksService.createTask(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof tasksService.createTask>[2],
    requestContext(req),
  );
  ok(req, res, task, 201);
}

export async function updateTaskHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const task = await tasksService.updateTask(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof tasksService.updateTask>[2],
    requestContext(req),
  );
  ok(req, res, task);
}

export async function completeTaskHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const task = await tasksService.completeTask(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof tasksService.completeTask>[2],
    requestContext(req),
  );
  ok(req, res, task);
}

export async function reassignTaskHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const task = await tasksService.reassignTask(
    { ...user, email: user.email },
    req.params.id as string,
    req.body as Parameters<typeof tasksService.reassignTask>[2],
    requestContext(req),
  );
  ok(req, res, task);
}
