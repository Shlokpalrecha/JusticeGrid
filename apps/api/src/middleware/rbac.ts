import type { NextFunction, Request, Response } from "express";
import {
  AppError,
  hasCapability,
  hasUnscopedCapability,
  type Capability,
} from "@justicegrid/shared";
import { writeAuditEntry } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { getRequestId } from "./requestId.js";

export interface RequireCapabilityOptions {
  /**
   * `true` requires the *unscoped* (`true`, not `"scoped"`) grant — for
   * routes where a `"scoped"` entry in the RBAC matrix names a
   * *different, narrower* resource than the one this route serves.
   * Concretely: spec §8.3's matrix gives LEGAL_PROFESSIONAL "❌ (own case
   * entries only)" for VIEW_AUDIT_LOG, but spec §7 marks the global
   * `/audit` module (this route) "(ADMIN/AUDITOR)" only — the scoped
   * grant is for the separate `GET /cases/:id/audit` sub-resource
   * (Phase 4), not this one. Default `false`.
   */
  unscoped?: boolean;
}

/**
 * Route-level RBAC guard (spec §8.3/§8.4): reads the shared capability
 * matrix, the single source of truth both this middleware and the web
 * app's navigation consult. This is the FIRST of the two authorization
 * layers spec §8.4 requires — a `"scoped"` grant here means "allowed in
 * principle, but the service layer must still run its own ownership
 * check" (e.g. `assertCanAccessCase`, added per-module in Phase 4+); a
 * plain pass through this middleware alone is never sufficient proof of
 * authorization for a scoped capability.
 *
 * A denial is itself an audited security event (`ACCESS_DENIED`, spec
 * §8.9), written outside any business-mutation transaction since, by
 * definition, no mutation happens when access is denied. Awaited before
 * responding (this is `async`, relying on `express-async-errors` from
 * app.ts) so the audit write isn't a best-effort afterthought; a failure
 * to write it is logged but never masks the 403 itself.
 */
export function requireCapability(capability: Capability, options: RequireCapabilityOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication is required for this action.");
    }

    const granted = options.unscoped
      ? hasUnscopedCapability(user.role, capability)
      : hasCapability(user.role, capability);
    if (granted) {
      next();
      return;
    }

    const requestId = getRequestId(req);
    try {
      await prisma.$transaction((tx) =>
        writeAuditEntry(
          tx,
          { id: user.id, email: user.email, role: user.role },
          { ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null, requestId },
          {
            action: "ACCESS_DENIED",
            entityType: "Route",
            entityLabel: `${req.method} ${req.path}`,
            summary: `${user.email} (${user.role}) was denied "${capability}" on ${req.method} ${req.path}`,
            success: false,
            failureReason: `Missing capability: ${capability}`,
          },
        ),
      );
    } catch (err) {
      logger.error({ err, requestId }, "Failed to write ACCESS_DENIED audit entry");
    }

    throw new AppError(
      "FORBIDDEN",
      `You do not have permission to perform this action ("${capability}").`,
    );
  };
}
