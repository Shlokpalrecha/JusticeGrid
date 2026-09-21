import { Router } from "express";
import {
  CaseArchiveInputSchema,
  CaseAssignInputSchema,
  CaseCreateInputSchema,
  CaseFilterQuerySchema,
  CaseNoteCreateInputSchema,
  CaseUpdateInputSchema,
  ChargeCreateInputSchema,
  IdParamSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import {
  addCaseNoteHandler,
  addChargeHandler,
  archiveCaseHandler,
  assignCaseHandler,
  createCaseHandler,
  getCaseAuditHandler,
  getCaseHandler,
  getCaseTimelineHandler,
  listCasesHandler,
  listChargesHandler,
  unassignCaseHandler,
  updateCaseHandler,
} from "./cases.controller.js";
import { caseHearingsRouter } from "../hearings/hearings.routes.js";
import { caseTasksRouter } from "../tasks/tasks.routes.js";
import { caseDocumentsRouter } from "../documents/documents.routes.js";

export const casesRouter: Router = Router();

casesRouter.get(
  "/",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateQuery(CaseFilterQuerySchema),
  listCasesHandler,
);
casesRouter.post(
  "/",
  requireAuth,
  requireCapability("CREATE_EDIT_CASE"),
  validateBody(CaseCreateInputSchema),
  createCaseHandler,
);
casesRouter.get(
  "/:id",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  getCaseHandler,
);
casesRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("CREATE_EDIT_CASE"),
  validateParams(IdParamSchema),
  validateBody(CaseUpdateInputSchema),
  updateCaseHandler,
);
casesRouter.post(
  "/:id/assign",
  requireAuth,
  requireCapability("ASSIGN_CASE"),
  validateParams(IdParamSchema),
  validateBody(CaseAssignInputSchema),
  assignCaseHandler,
);
casesRouter.post(
  "/:id/unassign",
  requireAuth,
  requireCapability("ASSIGN_CASE"),
  validateParams(IdParamSchema),
  unassignCaseHandler,
);
casesRouter.post(
  "/:id/archive",
  requireAuth,
  requireCapability("CREATE_EDIT_CASE"),
  validateParams(IdParamSchema),
  validateBody(CaseArchiveInputSchema),
  archiveCaseHandler,
);
casesRouter.get(
  "/:id/timeline",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  getCaseTimelineHandler,
);
casesRouter.get(
  "/:id/audit",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG"),
  validateParams(IdParamSchema),
  getCaseAuditHandler,
);
casesRouter.post(
  "/:id/notes",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(CaseNoteCreateInputSchema),
  addCaseNoteHandler,
);
casesRouter.get(
  "/:id/charges",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  listChargesHandler,
);
casesRouter.post(
  "/:id/charges",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(ChargeCreateInputSchema),
  addChargeHandler,
);

// Nested resource routers — auth/RBAC/validation for each individual
// route lives in the nested router itself (hearings.routes.ts etc.), not
// duplicated here.
casesRouter.use("/:id/hearings", caseHearingsRouter);
casesRouter.use("/:id/tasks", caseTasksRouter);
casesRouter.use("/:id/documents", caseDocumentsRouter);
