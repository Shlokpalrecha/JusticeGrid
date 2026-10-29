import { replayEvaluation } from "./priority.service.js";
import { Router } from "express";
import { z } from "zod";
import { PriorityQueueFilterSchema } from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import {
  getCasePriorityHandler,
  getCasePriorityHistoryHandler,
  getDistributionHandler,
  getQueueHandler,
  recomputeCaseHandler,
} from "./priority.controller.js";

const CaseIdParamSchema = z.object({ caseId: z.string().min(1) }).strict();

export const priorityRouter: Router = Router();

priorityRouter.get(
  "/queue",
  requireAuth,
  requireCapability("VIEW_FULL_PRIORITY_QUEUE"),
  validateQuery(PriorityQueueFilterSchema),
  getQueueHandler,
);
priorityRouter.get(
  "/case/:caseId",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(CaseIdParamSchema),
  getCasePriorityHandler,
);
priorityRouter.get(
  "/case/:caseId/history",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(CaseIdParamSchema),
  getCasePriorityHistoryHandler,
);
priorityRouter.post(
  "/case/:caseId/recompute",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(CaseIdParamSchema),
  recomputeCaseHandler,
);
priorityRouter.get(
  "/distribution",
  requireAuth,
  requireCapability("VIEW_FULL_PRIORITY_QUEUE"),
  getDistributionHandler,
);

priorityRouter.get(
  "/evaluations/:id/replay",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  async (req, res) => {
    if (!req.user) return;
    res.json({ success: true, data: await replayEvaluation(req.user, req.params.id!) });
  },
);
