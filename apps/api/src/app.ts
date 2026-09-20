import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";

/**
 * JusticeGrid API — Express application.
 *
 * Prototype system. Synthetic data only. Workflow prioritization is a
 * review aid, not a legal or judicial decision. All actions require human
 * review. See JUSTICEGRID_BUILD_SPEC.md §1 for the full guardrails this
 * codebase must never violate.
 *
 * This is the Phase 0 skeleton: health checks only. Auth, RBAC, audit
 * middleware, and domain routes are wired in Phases 3–6.
 */
export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  app.get("/api/v1/health/ready", (_req, res) => {
    // Phase 3 extends this with a real DB connectivity check.
    res.json({ success: true, data: { status: "ready" } });
  });

  app.get("/api/v1/version", (_req, res) => {
    res.json({ success: true, data: { name: "justicegrid-api", version: "0.1.0" } });
  });

  // Central error handler — replaced with the full error-envelope
  // middleware (spec §7) in Phase 3.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      });
    },
  );

  return app;
}
