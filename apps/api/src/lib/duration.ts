import { AppError } from "@justicegrid/shared";

/**
 * Parses a short duration string (as used for ACCESS_TOKEN_TTL /
 * REFRESH_TOKEN_TTL in .env.example, e.g. "15m", "7d") into
 * milliseconds. Kept minimal and dependency-free rather than pulling in
 * a duration-parsing library for four unit suffixes.
 */
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseDurationMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Invalid duration string: "${duration}" (expected e.g. "15m", "7d")`,
    );
  }
  const [, amountStr, unit] = match;
  return Number(amountStr) * (UNIT_MS[unit as string] as number);
}
