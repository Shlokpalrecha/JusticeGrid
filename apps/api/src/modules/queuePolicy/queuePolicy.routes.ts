import { guardSystemRequest } from "../../lib/systemRequests.js";
import { Router } from "express";
import { z } from "zod";
import {
  AppError,
  PolicyPublishSchema,
  PolicySimulateSchema,
  ProfileCreateSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { getRequestId } from "../../middleware/requestId.js";
import * as service from "./queuePolicy.service.js";
export const queuePolicyRouter: Router = Router();
queuePolicyRouter.use(requireAuth);
const rollback = z
  .object({ expectedVersion: z.number().int().positive(), changeReason: z.string().trim().min(1) })
  .strict();
queuePolicyRouter.get("/", requireCapability("VIEW_ANY_CASE"), async (_req, res) => {
  res.json({ success: true, data: await service.getPolicy() });
});
queuePolicyRouter.post("/simulate", requireCapability("CONFIGURE_RULES"), async (req, res) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
  const input = PolicySimulateSchema.parse(req.body);
  res.json({
    success: true,
    data: await guardSystemRequest(req, () => service.simulatePolicy(req.user!, input.config)),
  });
});
queuePolicyRouter.post("/publish", requireCapability("CONFIGURE_RULES"), async (req, res) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
  const input = PolicyPublishSchema.parse(req.body);
  res.json({
    success: true,
    data: await guardSystemRequest(req, () =>
      service.publishPolicy(req.user!, input.config, input.expectedVersion, input.changeReason, {
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
        requestId: getRequestId(req),
      }),
    ),
  });
});
queuePolicyRouter.post(
  "/rollback/:version",
  requireCapability("CONFIGURE_RULES"),
  async (req, res) => {
    if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
    const input = rollback.parse(req.body),
      version = z.coerce.number().int().positive().parse(req.params.version);
    res.json({
      success: true,
      data: await guardSystemRequest(req, () =>
        service.rollbackPolicy(req.user!, version, input.expectedVersion, input.changeReason, {
          ipAddress: req.ip ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          requestId: getRequestId(req),
        }),
      ),
    });
  },
);
queuePolicyRouter.post("/profiles", requireCapability("CONFIGURE_RULES"), async (req, res) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first");
  const input = ProfileCreateSchema.parse(req.body);
  res.status(201).json({
    success: true,
    data: await service.createProfile(req.user, input, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      requestId: getRequestId(req),
    }),
  });
});
