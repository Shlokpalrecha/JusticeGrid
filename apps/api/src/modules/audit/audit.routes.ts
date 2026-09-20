import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireCapability } from "../../middleware/rbac.js";
import { verifyChainHandler } from "./audit.controller.js";

/**
 * Only `GET /audit/verify-chain` is built in Phase 3 — the direct,
 * testable proof that the hash-chain implementation in lib/audit.ts is
 * correct (spec §11: "hash chain verifies; tampering a row breaks
 * verification"). The full listing/filtering/export routes from spec §7
 * (`GET /audit`, `GET /audit/:id`, `GET /audit/export.csv`) need
 * pagination plumbing shared with the rest of the reporting surface and
 * are built in Phase 6 alongside it.
 */
export const auditRouter: Router = Router();

auditRouter.get(
  "/verify-chain",
  requireAuth,
  requireCapability("VIEW_AUDIT_LOG", { unscoped: true }),
  verifyChainHandler,
);
