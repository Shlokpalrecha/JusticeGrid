import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "@justicegrid/shared";
import { errorHandler, notFoundHandler } from "./errors.js";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: { "x-request-id": "req-test" },
    method: "GET",
    path: "/x",
    ...overrides,
  } as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("errorHandler", () => {
  it("maps an AppError to its own code and httpStatus", () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler(new AppError("FORBIDDEN", "nope"), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "FORBIDDEN", message: "nope", details: undefined, requestId: "req-test" },
    });
  });

  it("maps an AppError's details array through to the response", () => {
    const req = mockReq();
    const res = mockRes();
    const details = [{ field: "email", issue: "Required" }];
    errorHandler(new AppError("VALIDATION_ERROR", "bad input", details), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ details }) }),
    );
  });

  it("maps a ZodError to a VALIDATION_ERROR envelope with field-level details", () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "not-an-email" });
    if (result.success) throw new Error("expected validation to fail");

    const req = mockReq();
    const res = mockRes();
    errorHandler(result.error, req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const [payload] = (res.json as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { error: { code: string; details: { field: string }[] } },
    ];
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.details[0]?.field).toBe("email");
  });

  it("maps an unrecognized thrown value to a generic INTERNAL_ERROR, never leaking its message", () => {
    const req = mockReq();
    const res = mockRes();
    errorHandler(new Error("some internal detail that must not leak"), req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: "req-test",
      },
    });
  });

  it("falls back to 'unknown' for requestId when the header is missing", () => {
    const req = mockReq({ headers: {} });
    const res = mockRes();
    errorHandler(new AppError("NOT_FOUND", "missing"), req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ requestId: "unknown" }) }),
    );
  });
});

describe("notFoundHandler", () => {
  it("returns a 404 envelope naming the unmatched method and path", () => {
    const req = mockReq({ method: "POST", path: "/nope" });
    const res = mockRes();
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "No route matches POST /nope",
        requestId: "req-test",
      },
    });
  });
});
