import { Router } from "express";
import { AuditLogFilterSchema, IdParamSchema } from "@justicegrid/shared";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { validateParams, validateQuery } from "../../middleware/validate.js";
import {
  exportAuditLogCsvHandler,
  getAuditLogEntryHandler,
  listAuditLogHandler,
  verifyChainHandler,
} from "./audit.controller.js";

/**
 * Spec §7: `GET /audit`, `GET /audit/:id`, `GET /audit/verify-chain`,
 * `GET /audit/export.csv` — ADMIN/AUDITOR only (spec §8.3's
 * VIEW_AUDIT_LOG is unscoped for both; a LEGAL_PROFESSIONAL's `"scoped"`
 * grant is for the separate `GET /cases/:id/audit` sub-resource built in
 * Phase 4, not this global module — see `requireCapability`'s
 * `unscoped` option). Literal-path routes (`/verify-chain`,
 * `/export.csv`) are registered before `/:id` so Express doesn't treat
 * either literal segment as an `:id` value.
 */
export const auditRouter: Router = Router();

auditRouter.get(
  "/",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG", { unscoped: true }),
  validateQuery(AuditLogFilterSchema),
  listAuditLogHandler,
);
auditRouter.get(
  "/verify-chain",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG", { unscoped: true }),
  verifyChainHandler,
);
auditRouter.get(
  "/export.csv",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG", { unscoped: true }),
  validateQuery(AuditLogFilterSchema),
  exportAuditLogCsvHandler,
);
auditRouter.get(
  "/:id",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG", { unscoped: true }),
  validateParams(IdParamSchema),
  getAuditLogEntryHandler,
);
