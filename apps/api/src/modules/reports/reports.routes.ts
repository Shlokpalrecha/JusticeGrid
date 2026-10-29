import { Router } from "express";
import {
  CompletedReportQuerySchema,
  ReportExportParamSchema,
  ReportExportQuerySchema,
  UpcomingHearingsQuerySchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import {
  caseAgingHandler,
  completedHandler,
  overdueActionsHandler,
  pendingByUserHandler,
  priorityDistributionHandler,
  reportExportCsvHandler,
  ruleTriggerFrequencyHandler,
  upcomingHearingsHandler,
} from "./reports.controller.js";

/** spec §7: every report requires EXPORT_REPORTS — `"scoped"` for
 * LEGAL_PROFESSIONAL (own assigned cases only, enforced inside
 * reports.service.ts, not here), `true` for ADMIN/AUDITOR. */
export const reportsRouter: Router = Router();

reportsRouter.get(
  "/pending-by-user",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  pendingByUserHandler,
);
reportsRouter.get(
  "/upcoming-hearings",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  validateQuery(UpcomingHearingsQuerySchema),
  upcomingHearingsHandler,
);
reportsRouter.get(
  "/overdue-actions",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  overdueActionsHandler,
);
reportsRouter.get(
  "/priority-distribution",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  priorityDistributionHandler,
);
reportsRouter.get(
  "/completed",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  validateQuery(CompletedReportQuerySchema),
  completedHandler,
);
reportsRouter.get(
  "/case-aging",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  caseAgingHandler,
);
reportsRouter.get(
  "/action-frequency",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  ruleTriggerFrequencyHandler,
);
reportsRouter.get(
  "/:name/export.csv",
  requireAuth,
  requireCapability("EXPORT_REPORTS"),
  validateParams(ReportExportParamSchema),
  validateQuery(ReportExportQuerySchema),
  reportExportCsvHandler,
);
