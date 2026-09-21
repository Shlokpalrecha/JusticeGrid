import { Router } from "express";
import {
  IdParamSchema,
  TaskCompleteInputSchema,
  TaskCreateInputSchema,
  TaskFilterQuerySchema,
  TaskReassignInputSchema,
  TaskUpdateInputSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import {
  completeTaskHandler,
  createTaskHandler,
  getMyTaskQueueHandler,
  listTasksHandler,
  reassignTaskHandler,
  updateTaskHandler,
} from "./tasks.controller.js";

/** Mounted at `/api/v1/cases/:id/tasks` — create, nested under a case. */
export const caseTasksRouter: Router = Router({ mergeParams: true });
caseTasksRouter.post(
  "/",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(TaskCreateInputSchema),
  createTaskHandler,
);

/** Mounted at `/api/v1/tasks` — top-level, addressed by the task's own id. */
export const tasksRouter: Router = Router();
tasksRouter.get(
  "/",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateQuery(TaskFilterQuerySchema),
  listTasksHandler,
);
tasksRouter.get(
  "/my-queue",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  getMyTaskQueueHandler,
);
tasksRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(TaskUpdateInputSchema),
  updateTaskHandler,
);
tasksRouter.post(
  "/:id/complete",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(TaskCompleteInputSchema),
  completeTaskHandler,
);
tasksRouter.post(
  "/:id/reassign",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(TaskReassignInputSchema),
  reassignTaskHandler,
);
