import type { NextFunction, Request, Response } from "express";
import { AppError, type Role } from "@justicegrid/shared";
import { AccessTokenExpiredError, AccessTokenInvalidError, verifyAccessToken } from "../lib/jwt.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own augmentation pattern
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <token>` access token and attaches
 * `req.user`. Deliberately does not hit the database on every request —
 * the access token's short 15-minute TTL (spec §8.2) is what bounds
 * staleness for e.g. a just-deactivated user; the refresh flow (which
 * does touch the DB, checking token-family revocation) is where
 * stateful revocation actually lives.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("UNAUTHENTICATED", "Missing or malformed Authorization header.");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token.length === 0) {
    throw new AppError("UNAUTHENTICATED", "Missing bearer token.");
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof AccessTokenExpiredError) {
      throw new AppError("TOKEN_EXPIRED", "Access token has expired.");
    }
    if (err instanceof AccessTokenInvalidError) {
      throw new AppError("UNAUTHENTICATED", "Access token is invalid.");
    }
    throw err;
  }
}
