import { Router } from "express";
import {
  AppError,
  WorkflowUpdateSchema,
  ActionCreateSchema,
  ActionTransitionSchema,
  ActionOverrideSchema,
  ActionAssignSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { getRequestId } from "../../middleware/requestId.js";
import { prisma } from "../../lib/prisma.js";
import * as service from "./workflow.service.js";
export const workflowRouter: Router = Router();
workflowRouter.use(requireAuth);
workflowRouter.get("/owners", requireCapability("VIEW_ANY_CASE"), async (_req, res) => {
  res.json({
    success: true,
    data: await prisma.user.findMany({
      where: { isActive: true, deletedAt: null, role: { not: "AUDITOR" } },
      select: { id: true, fullName: true, role: true },
    }),
  });
});
workflowRouter.get("/case/:caseId", requireCapability("VIEW_ANY_CASE"), async (req, res) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
  res.json({ success: true, data: await service.getWorkflow(req.user, req.params.caseId!) });
});
workflowRouter.put("/case/:caseId", requireCapability("RECORD_CASE_ACTIVITY"), async (req, res) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
  res.json({
    success: true,
    data: await service.updateWorkflow(
      req.user,
      req.params.caseId!,
      WorkflowUpdateSchema.parse(req.body),
      {
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
        requestId: getRequestId(req),
      },
    ),
  });
});
workflowRouter.post(
  "/case/:caseId/actions",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
    res.status(201).json({
      success: true,
      data: await service.createAction(
        req.user,
        req.params.caseId!,
        ActionCreateSchema.parse(req.body),
        {
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          requestId: getRequestId(req),
        },
      ),
    });
  },
);
workflowRouter.patch(
  "/case/:caseId/actions/:id",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
    res.json({
      success: true,
      data: await service.transitionAction(
        req.user,
        req.params.caseId!,
        req.params.id!,
        ActionTransitionSchema.parse(req.body),
        {
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          requestId: getRequestId(req),
        },
      ),
    });
  },
);
workflowRouter.post(
  "/case/:caseId/actions/:id/override",
  requireCapability("CONFIGURE_RULES"),
  async (req, res) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
    res.json({
      success: true,
      data: await service.overrideAction(
        req.user,
        req.params.caseId!,
        req.params.id!,
        ActionOverrideSchema.parse(req.body),
        {
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          requestId: getRequestId(req),
        },
      ),
    });
  },
);

workflowRouter.post(
  "/case/:caseId/actions/:id/assign",
  requireCapability("RECORD_CASE_ACTIVITY"),
  async (req, res) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
    res.json({
      success: true,
      data: await service.assignAction(
        req.user,
        req.params.caseId!,
        req.params.id!,
        ActionAssignSchema.parse(req.body),
        {
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          requestId: getRequestId(req),
        },
      ),
    });
  },
);
