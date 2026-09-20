import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Request, Response } from "express";
import { AppError } from "@justicegrid/shared";
import { validateBody, validateParams, validateQuery } from "./validate.js";

function mockRes(): Response {
  return {} as Response;
}

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) }).strict();

  it("replaces req.body with the parsed, typed value and calls next()", () => {
    const req = { body: { name: "ok" } } as Request;
    const next = vi.fn();
    validateBody(schema)(req, mockRes(), next);
    expect(req.body).toEqual({ name: "ok" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws a VALIDATION_ERROR AppError for an invalid body, without calling next()", () => {
    const req = { body: { name: "" } } as Request;
    const next = vi.fn();
    expect(() => validateBody(schema)(req, mockRes(), next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unknown field (schema is .strict())", () => {
    const req = { body: { name: "ok", extra: "nope" } } as Request;
    expect(() => validateBody(schema)(req, mockRes(), vi.fn())).toThrow(AppError);
  });
});

describe("validateQuery", () => {
  const schema = z.object({ page: z.coerce.number().int().positive().default(1) }).strict();

  it("coerces and defaults query values, merging them onto req.query", () => {
    const req = { query: { page: "3" } } as unknown as Request;
    const next = vi.fn();
    validateQuery(schema)(req, mockRes(), next);
    expect(req.query.page).toBe(3);
    expect(next).toHaveBeenCalledOnce();
  });

  it("applies defaults for an absent field", () => {
    const req = { query: {} } as unknown as Request;
    validateQuery(schema)(req, mockRes(), vi.fn());
    expect(req.query.page).toBe(1);
  });

  it("throws for a query value that fails validation", () => {
    const req = { query: { page: "not-a-number" } } as unknown as Request;
    expect(() => validateQuery(schema)(req, mockRes(), vi.fn())).toThrow(AppError);
  });
});

describe("validateParams", () => {
  const schema = z.object({ id: z.string().min(1) }).strict();

  it("merges validated params onto req.params", () => {
    const req = { params: { id: "abc" } } as unknown as Request;
    const next = vi.fn();
    validateParams(schema)(req, mockRes(), next);
    expect(req.params.id).toBe("abc");
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws for a missing required param", () => {
    const req = { params: {} } as unknown as Request;
    expect(() => validateParams(schema)(req, mockRes(), vi.fn())).toThrow(AppError);
  });
});
