import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import {
  AccessTokenExpiredError,
  AccessTokenInvalidError,
  signAccessToken,
  verifyAccessToken,
} from "./jwt.js";

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a payload", () => {
    const token = signAccessToken({ sub: "user-1", email: "a@b.test", role: "ADMIN" });
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ sub: "user-1", email: "a@b.test", role: "ADMIN" });
  });

  it("throws AccessTokenExpiredError for an expired token (T-item: token expiry)", () => {
    const expiredToken = jwt.sign(
      { sub: "user-1", email: "a@b.test", role: "ADMIN" },
      env.JWT_SECRET,
      { expiresIn: -10 }, // already expired 10 seconds ago
    );
    expect(() => verifyAccessToken(expiredToken)).toThrow(AccessTokenExpiredError);
  });

  it("throws AccessTokenInvalidError for a token signed with the wrong secret", () => {
    const foreignToken = jwt.sign(
      { sub: "user-1", email: "a@b.test", role: "ADMIN" },
      "a-completely-different-secret-at-least-32-chars",
      { expiresIn: "15m" },
    );
    expect(() => verifyAccessToken(foreignToken)).toThrow(AccessTokenInvalidError);
  });

  it("throws AccessTokenInvalidError for a malformed token", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow(AccessTokenInvalidError);
  });

  it("throws AccessTokenInvalidError for a token missing required claims", () => {
    const incomplete = jwt.sign({ sub: "user-1" }, env.JWT_SECRET, { expiresIn: "15m" });
    expect(() => verifyAccessToken(incomplete)).toThrow(AccessTokenInvalidError);
  });
});
