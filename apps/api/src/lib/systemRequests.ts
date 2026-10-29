import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "@justicegrid/shared";
import { ExpressionError, GraphError, HeapConflict } from "@justicegrid/rules-engine";
import { prisma } from "./prisma.js";
import { writeAuditEntry } from "./audit.js";
import { getRequestId } from "../middleware/requestId.js";
const actor = (req: Request) => {
  if (!req.user) throw new AppError("UNAUTHENTICATED", "Sign in first.");
  return req.user;
};
const requestContext = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.headers["user-agent"] ?? null,
  requestId: getRequestId(req),
});
/** Rejects roll back separately from their durable collision/rejection ledger entry. */
export async function guardSystemRequest<T>(req: Request, run: () => T | Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const mapped =
      error instanceof GraphError
        ? new AppError(
            error.code === "CYCLE_DETECTED" ? "CYCLE_DETECTED" : "VALIDATION_ERROR",
            error.message,
          )
        : error instanceof ExpressionError
          ? new AppError("RULE_PARSE_ERROR", error.message)
          : error instanceof HeapConflict
            ? new AppError("CONFLICT", error.message)
            : error instanceof Prisma.PrismaClientKnownRequestError &&
                ["P2034", "P2028"].includes(error.code)
              ? new AppError("CONFLICT", "Concurrent operation or lock timeout; reload and retry.")
              : error instanceof RangeError
                ? new AppError("CAPACITY_EXCEEDED", error.message)
                : error;
    if (
      mapped instanceof AppError &&
      ["CONFLICT", "CYCLE_DETECTED", "DEPENDENCY_BLOCKED", "RULE_PARSE_ERROR"].includes(mapped.code)
    )
      await prisma.$transaction(
        (tx) =>
          writeAuditEntry(tx, actor(req), requestContext(req), {
            action: "UPDATE",
            entityType: "SystemRejection",
            entityLabel: mapped.code,
            summary: mapped.message,
            success: false,
            failureReason: mapped.code,
            before: {
              expectedRevision:
                (req.body as { expectedRevision?: number })?.expectedRevision ??
                (req.body as { expectedVersion?: number })?.expectedVersion ??
                null,
            },
            after: {
              path: req.path,
              rejected: true,
              code: mapped.code,
              message: mapped.message,
              attemptedValue: req.body as unknown,
            },
          }),
        { timeout: 30_000, maxWait: 10_000 },
      );
    throw mapped;
  }
}
