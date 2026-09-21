import { Router } from "express";
import {
  DocumentCreateInputSchema,
  DocumentUpdateInputSchema,
  DocumentVerifyInputSchema,
  IdParamSchema,
} from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import {
  addDocumentHandler,
  applyChecklistHandler,
  listDocumentsHandler,
  updateDocumentHandler,
  verifyDocumentHandler,
} from "./documents.controller.js";

/** Mounted at `/api/v1/cases/:id/documents` — list/create/apply-checklist, nested under a case. */
export const caseDocumentsRouter: Router = Router({ mergeParams: true });
caseDocumentsRouter.get(
  "/",
  requireAuth,
  requireCapability("VIEW_ANY_CASE"),
  validateParams(IdParamSchema),
  listDocumentsHandler,
);
caseDocumentsRouter.post(
  "/",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(DocumentCreateInputSchema),
  addDocumentHandler,
);
caseDocumentsRouter.post(
  "/apply-checklist",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  applyChecklistHandler,
);

/** Mounted at `/api/v1/documents` — top-level, addressed by the document's own id. */
export const documentsRouter: Router = Router();
documentsRouter.patch(
  "/:id",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(DocumentUpdateInputSchema),
  updateDocumentHandler,
);
documentsRouter.post(
  "/:id/verify",
  requireAuth,
  requireCapability("RECORD_CASE_ACTIVITY"),
  validateParams(IdParamSchema),
  validateBody(DocumentVerifyInputSchema),
  verifyDocumentHandler,
);
