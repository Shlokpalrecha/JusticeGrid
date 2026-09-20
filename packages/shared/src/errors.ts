import { z } from "zod";

/**
 * Error codes from spec §7. Every API error response uses one of these in
 * its envelope's `error.code` field.
 */
export const ERROR_CODE_VALUES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "TOKEN_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "ACCOUNT_LOCKED",
  "IMMUTABLE_RECORD",
  "INTERNAL_ERROR",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODE_VALUES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * The HTTP status each error code maps to. The API's error-handling
 * middleware (built in Phase 3) is the single place that should consult
 * this, so status codes never drift out of sync with the error code
 * vocabulary across route handlers.
 */
export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ACCOUNT_LOCKED: 423,
  IMMUTABLE_RECORD: 409,
  INTERNAL_ERROR: 500,
};

/**
 * A thrown, typed application error. Phase 3's error-handling middleware
 * catches this (and only this) to build the error envelope; anything else
 * thrown is treated as an unexpected INTERNAL_ERROR and logged with full
 * detail server-side but never leaked to the client.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: { field: string; issue: string }[];

  constructor(code: ErrorCode, message: string, details?: { field: string; issue: string }[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return ERROR_CODE_HTTP_STATUS[this.code];
  }
}
