/**
 * Calendar-day math in Asia/Kolkata (spec §6.2), with zero dependencies —
 * no date-fns/date-fns-tz, since this package imports nothing.
 *
 * Asia/Kolkata is a fixed UTC+5:30 offset with no daylight saving, so
 * "what calendar date is this instant, in Kolkata" is a constant-offset
 * shift, not a real timezone-database lookup — implementable here in a
 * few lines without a date library.
 *
 * Not part of spec §4's minimum rules-engine file list (types/conditions/
 * evaluate/score/explain/ordering/hash/version/index), but the day-math
 * it centralizes is used by nearly every file in that list; splitting it
 * out keeps conditions.ts focused on condition semantics rather than
 * timezone arithmetic repeated sixteen times.
 */

const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar date (YYYY-MM-DD) an instant falls on in Asia/Kolkata,
 * computed via a fixed offset shift then reading UTC getters — never the
 * host machine's local timezone, so the result is identical no matter
 * where this code runs.
 */
export function toKolkataDateString(instant: Date): string {
  const shifted = new Date(instant.getTime() + KOLKATA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes a date field from CaseEvaluationInput to its YYYY-MM-DD
 * calendar date. A bare date ("2026-09-20") is returned as-is — there is
 * no instant to convert, and the engine's contract treats these as
 * already being the correct calendar date. A full ISO datetime string is
 * converted via its Asia/Kolkata calendar date, so the engine stays
 * correct even if a caller passes through an unmodified Prisma DateTime
 * serialization.
 */
export function normalizeDateString(value: string): string {
  if (BARE_DATE_PATTERN.test(value)) return value;
  return toKolkataDateString(new Date(value));
}

/**
 * Whole calendar days from `fromDateStr` to `toDateStr` (positive when
 * `to` is later). Both are normalized first, then compared as UTC
 * midnight instants of the same calendar date — this is deliberately NOT
 * "instant b minus instant a divided by 24h", which would misbehave
 * across a DST boundary; Kolkata has none, but the UTC-midnight approach
 * is correct regardless and keeps this function trivially testable.
 */
export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = normalizeDateString(fromDateStr);
  const to = normalizeDateString(toDateStr);
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

/** `true` when `dateStr` (normalized) falls within [0, days] days from
 * `todayStr`, inclusive of today — the "within N days" semantics used
 * throughout spec §6.3's condition table. */
export function isWithinDays(todayStr: string, dateStr: string, days: number): boolean {
  const diff = daysBetween(todayStr, dateStr);
  return diff >= 0 && diff <= days;
}
