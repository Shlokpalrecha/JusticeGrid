import { Router } from "express";
import { IdParamSchema, NotificationListQuerySchema } from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "./notifications.controller.js";

/** spec §7: every route here is implicitly scoped to the caller — no
 * capability gate needed beyond being an authenticated user, since
 * there is no "view another user's notifications" for any role. */
export const notificationsRouter: Router = Router();

notificationsRouter.get(
  "/",
  requireAuth,
  validateQuery(NotificationListQuerySchema),
  listNotificationsHandler,
);
notificationsRouter.post(
  "/:id/read",
  requireAuth,
  validateParams(IdParamSchema),
  markNotificationReadHandler,
);
notificationsRouter.post("/read-all", requireAuth, markAllNotificationsReadHandler);
