import { Router } from "express";
import {
  HearingCreateInputSchema,
  HearingMarkOrderReviewedInputSchema,
  HearingUpcomingQuerySchema,
  HearingUpdateInputSchema,
  IdParamSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import {
  createHearingHandler,
  listHearingsHandler,
  listUpcomingHearingsHandler,
  markOrderReviewedHandler,
  updateHearingHandler,
} from "./hearings.controller.js";

/** Mounted at `/api/v1/cases/:id/hearings` — list/create, nested under a case. */
export const caseHearingsRouter: Router = Router({ mergeParams: true });
caseHearingsRouter.get(
  "/",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  listHearingsHandler,
);
caseHearingsRouter.post(
  "/",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(HearingCreateInputSchema),
  createHearingHandler,
);

/** Mounted at `/api/v1/hearings` — top-level, addressed by the hearing's own id. */
export const hearingsRouter: Router = Router();
hearingsRouter.get(
  "/upcoming",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateQuery(HearingUpcomingQuerySchema),
  listUpcomingHearingsHandler,
);
hearingsRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(HearingUpdateInputSchema),
  updateHearingHandler,
);
hearingsRouter.post(
  "/:id/mark-order-reviewed",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(HearingMarkOrderReviewedInputSchema),
  markOrderReviewedHandler,
);
