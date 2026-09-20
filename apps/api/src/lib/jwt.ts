import jwt from "jsonwebtoken";
import type { Role } from "@justicegrid/shared";
import { env } from "../config/env.js";

/**
 * Access token issuing/verification (spec §8.2): short-lived JWT, sent as
 * `Authorization: Bearer`, held in memory on the client (never in
 * localStorage — that's a web-app concern, enforced in Phase 8).
 */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

export class AccessTokenExpiredError extends Error {
  constructor() {
    super("Access token has expired");
    this.name = "AccessTokenExpiredError";
  }
}

export class AccessTokenInvalidError extends Error {
  constructor() {
    super("Access token is invalid");
    this.name = "AccessTokenInvalidError";
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string") throw new AccessTokenInvalidError();
    const { sub, email, role } = decoded as Partial<AccessTokenPayload>;
    if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") {
      throw new AccessTokenInvalidError();
    }
    return { sub, email, role };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AccessTokenExpiredError();
    if (err instanceof AccessTokenInvalidError) throw err;
    throw new AccessTokenInvalidError();
  }
}
