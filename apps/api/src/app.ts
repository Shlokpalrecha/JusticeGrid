import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { globalRateLimiter } from "./middleware/rateLimit.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";

/**
 * JusticeGrid API — Express application.
 *
 * Prototype system. Synthetic data only. Workflow prioritization is a
 * review aid, not a legal or judicial decision. All actions require human
 * review. See JUSTICEGRID_BUILD_SPEC.md §1 for the full guardrails this
 * codebase must never violate.
 */
export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  // Trust the first proxy hop (Docker/nginx in front of the API) so
  // `req.ip` reflects the real client address rather than the proxy's —
  // used for rate limiting and audit log IP capture.
  app.set("trust proxy", 1);
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
  app.use(requestIdMiddleware);
  app.use(globalRateLimiter);

  app.get("/api/v1/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  app.get("/api/v1/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ success: true, data: { status: "ready" } });
    } catch {
      res.status(503).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Database unavailable." },
      });
    }
  });

  app.get("/api/v1/version", (_req, res) => {
    res.json({ success: true, data: { name: "justicegrid-api", version: "0.1.0" } });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/audit", auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
