import { randomBytes, createHash } from "node:crypto";

/**
 * Refresh token mechanics (spec §8.2): opaque random 256-bit values,
 * never JWTs. The raw value is only ever held by the client (httpOnly
 * cookie) — the database stores only its SHA-256 hash, so a leaked DB
 * backup can't be used to mint sessions. `familyId` groups every token
 * produced by one rotation chain (starting at login), so reusing an
 * already-rotated token can revoke the whole family in one query.
 */

export function generateRefreshTokenValue(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshTokenValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateFamilyId(): string {
  return randomBytes(16).toString("hex");
}
