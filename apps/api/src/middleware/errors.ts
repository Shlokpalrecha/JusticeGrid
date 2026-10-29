import { ExpressionError,GraphError,HeapConflict } from "@justicegrid/rules-engine";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError, type ApiErrorResponse } from "@justicegrid/shared";
import { logger } from "../lib/logger.js";
import { getRequestId } from "./requestId.js";

/**
 * Central error-handling middleware (spec §7). Every route in this app
 * uses `express-async-errors` (imported once in app.ts), so a rejected
 * promise from an `async` handler reaches here exactly like a thrown
 * synchronous error would.
 *
 * `AppError` (packages/shared), `ZodError` (surfaced when a handler
 * validates something ad hoc, outside the `validate` middleware), and
 * Prisma's own known-request errors (P2002 unique-constraint violations
 * → CONFLICT; anything else Prisma-specific stays INTERNAL_ERROR, since
 * most Prisma error codes indicate a real server-side bug, not a
 * client-correctable request) are each given a specific envelope;
 * anything else is logged with full detail server-side and returned to
 * the client as a generic INTERNAL_ERROR — never leaking a stack trace
 * or implementation detail.
 */
// The 4-arg signature (including the unused `_next`) is required for
// Express to recognize this as error-handling middleware.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = getRequestId(req);
  if(err instanceof ExpressionError)err=new AppError("RULE_PARSE_ERROR",err.message);
  if(err instanceof GraphError)err=new AppError(err.code==="CYCLE_DETECTED"?"CYCLE_DETECTED":"VALIDATION_ERROR",err.message);
  if(err instanceof HeapConflict)err=new AppError("CONFLICT",err.message);

  if (err instanceof AppError) {
    if (err.code === "INTERNAL_ERROR") {
      logger.error({ err, requestId }, "Unhandled AppError reached the client as INTERNAL_ERROR");
    }
    const response: ApiErrorResponse = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details, requestId },
    };
    res.status(err.httpStatus).json(response);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
    res
      .status(409)
      .json({
        success: false,
        error: {
          code: "CONFLICT",
          message: "Concurrent workflow or policy change. Reload and retry.",
          requestId,
        },
      });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = Array.isArray(err.meta?.target)
      ? (err.meta.target as string[]).join(", ")
      : "field";
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "CONFLICT",
        message: `A record with this ${target} already exists.`,
        details: [{ field: target, issue: "Already in use" }],
        requestId,
      },
    };
    res.status(409).json(response);
    return;
  }

  if (err instanceof ZodError) {
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: err.issues.map((issue) => ({ field: issue.path.join("."), issue: issue.message })),
        requestId,
      },
    };
    res.status(400).json(response);
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  const response: ApiErrorResponse = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId },
  };
  res.status(500).json(response);
}

/** Mounted last, after every route — turns an unmatched path into a
 * proper NOT_FOUND envelope instead of Express's default HTML 404. */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      requestId: getRequestId(req),
    },
  };
  res.status(404).json(response);
}
