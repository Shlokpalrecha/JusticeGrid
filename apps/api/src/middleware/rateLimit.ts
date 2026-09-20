import rateLimit from "express-rate-limit";
import { AppError } from "@justicegrid/shared";
import { env } from "../config/env.js";

/** All rate-limit rejections use the standard error envelope, not
 * express-rate-limit's default plain-text response. */
function rateLimitedHandler(): never {
  throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.");
}

/** Global limiter (spec §8.6): 100 req/min/IP across the whole API. */
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler,
  keyGenerator: (req) => req.ip ?? "unknown",
});

/**
 * `/auth/login`-specific limiter (spec §8.6): 5 attempts per 15 minutes,
 * keyed by IP *and* the attempted email, so one attacker can't lock out
 * a legitimate user's IP-independent lockout window by spraying many
 * emails from one IP, nor bypass the limit by spoofing IPs against one
 * target email — both dimensions are rate-limited together. This is
 * distinct from the account-lockout logic in auth.service.ts (5
 * *consecutive* failures locks that specific account for 15 minutes,
 * tracked on the User row, independent of IP).
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitedHandler,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === "string" ? body.email.toLowerCase() : "unknown";
    return `${req.ip ?? "unknown"}:${email}`;
  },
});
