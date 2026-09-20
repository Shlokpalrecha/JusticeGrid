import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { AppError } from "@justicegrid/shared";

/**
 * Zod validation middleware factories (spec §8.5). Every schema used
 * here is `.strict()` at its call site (defined in packages/shared) so
 * an unknown key is a VALIDATION_ERROR, not a silently-ignored field.
 * Parsed, coerced/defaulted data replaces the raw `req.body`/`query`/
 * `params`, so handlers always see the validated shape, typed.
 */

function zodIssuesToDetails(err: z.ZodError): { field: string; issue: string }[] {
  return err.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    issue: issue.message,
  }));
}

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        zodIssuesToDetails(result.error),
      );
    }
    // Express types `req.body` as `any` itself — assigning the validated,
    // properly-typed `result.data` into it is inherently "unsafe" only
    // because of that framework-level `any`, not because of anything
    // this function does.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Query parameter validation failed.",
        zodIssuesToDetails(result.error),
      );
    }
    // Express 5 makes `req.query` a getter-only accessor; assigning
    // through `Object.assign` (rather than `req.query = result.data`)
    // keeps this middleware forward-compatible with either version.
    Object.assign(req.query as Record<string, unknown>, result.data);
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "URL parameter validation failed.",
        zodIssuesToDetails(result.error),
      );
    }
    Object.assign(req.params as Record<string, unknown>, result.data);
    next();
  };
}
