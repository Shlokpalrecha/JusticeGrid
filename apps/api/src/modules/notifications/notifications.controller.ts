import type { Request, Response } from "express";
import { AppError, type ApiSuccessResponse } from "@justicegrid/shared";
import { buildPageMeta } from "../../lib/pagination.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as notificationsService from "./notifications.service.js";

function requireUser(req: Request) {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  return req.user;
}

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const filter = req.query as unknown as Parameters<
    typeof notificationsService.listNotifications
  >[1];
  const { items, total, unreadCount } = await notificationsService.listNotifications(user, filter);
  // `unreadCount` rides along in `data` rather than `meta` — the shared
  // ResponseMeta envelope (envelope.ts) is generic pagination info reused
  // by every list endpoint, not a place for one route's domain field.
  const response: ApiSuccessResponse<{ items: typeof items; unreadCount: number }> = {
    success: true,
    data: { items, unreadCount },
    meta: buildPageMeta(getRequestId(req), filter, total),
  };
  res.status(200).json(response);
}

export async function markNotificationReadHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const notification = await notificationsService.markNotificationRead(
    user,
    req.params.id as string,
  );
  const response: ApiSuccessResponse<typeof notification> = {
    success: true,
    data: notification,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}

export async function markAllNotificationsReadHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const result = await notificationsService.markAllNotificationsRead(user);
  const response: ApiSuccessResponse<typeof result> = {
    success: true,
    data: result,
    meta: { requestId: getRequestId(req) },
  };
  res.status(200).json(response);
}
