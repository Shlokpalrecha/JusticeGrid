import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** Every request gets an `X-Request-Id` (client-supplied, if present —
 * useful for distributed tracing across a gateway — otherwise
 * generated), echoed on the response and threaded through logging, error
 * envelopes, and audit entries (spec §7/§8.7). */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers["x-request-id"];
  const requestId = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function getRequestId(req: Request): string {
  const value = req.headers["x-request-id"];
  return typeof value === "string" ? value : "unknown";
}
