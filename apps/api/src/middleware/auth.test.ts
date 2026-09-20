import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { AppError } from "@justicegrid/shared";
import { env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { requireAuth } from "./auth.js";

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as Request;
}

describe("requireAuth", () => {
  it("attaches req.user and calls next() for a valid Bearer token", () => {
    const token = signAccessToken({ sub: "u1", email: "a@b.test", role: "ADMIN" });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    requireAuth(req, {} as Response, next);
    expect(req.user).toEqual({ id: "u1", email: "a@b.test", role: "ADMIN" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws UNAUTHENTICATED when the Authorization header is missing", () => {
    expect(() => requireAuth(mockReq(), {} as Response, vi.fn())).toThrow(AppError);
    try {
      requireAuth(mockReq(), {} as Response, vi.fn());
    } catch (err) {
      expect((err as AppError).code).toBe("UNAUTHENTICATED");
    }
  });

  it("throws UNAUTHENTICATED for a non-Bearer scheme", () => {
    const req = mockReq({ authorization: "Basic dXNlcjpwYXNz" });
    expect(() => requireAuth(req, {} as Response, vi.fn())).toThrow(AppError);
  });

  it("throws UNAUTHENTICATED for an empty Bearer token", () => {
    const req = mockReq({ authorization: "Bearer    " });
    expect(() => requireAuth(req, {} as Response, vi.fn())).toThrow(AppError);
  });

  it("throws TOKEN_EXPIRED for an expired token", () => {
    const expired = jwt.sign({ sub: "u1", email: "a@b.test", role: "ADMIN" }, env.JWT_SECRET, {
      expiresIn: -10,
    });
    const req = mockReq({ authorization: `Bearer ${expired}` });
    try {
      requireAuth(req, {} as Response, vi.fn());
      throw new Error("expected requireAuth to throw");
    } catch (err) {
      expect((err as AppError).code).toBe("TOKEN_EXPIRED");
    }
  });

  it("throws UNAUTHENTICATED for a malformed token", () => {
    const req = mockReq({ authorization: "Bearer not-a-real-jwt" });
    try {
      requireAuth(req, {} as Response, vi.fn());
      throw new Error("expected requireAuth to throw");
    } catch (err) {
      expect((err as AppError).code).toBe("UNAUTHENTICATED");
    }
  });
});
