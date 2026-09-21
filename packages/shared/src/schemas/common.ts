import { z } from "zod";

/**
 * Small building blocks reused across every entity schema in this
 * directory.
 *
 * A note on scope (read honestly, not overclaimed): the schemas in this
 * directory describe the flat, single-row wire shape of each entity as
 * the API returns it — the "read" DTO. Request/create/update DTOs with
 * entity-specific business validation (e.g. "hearing scheduledDate not
 * before custodyStartDate", spec §8.5) are added incrementally in
 * Phases 4–6 as each API module is actually built, alongside its routes
 * and tests — defining them speculatively now, disconnected from the
 * handlers that would enforce them, would just be dead code.
 */

/** Prisma's cuid() ids are 25-char lowercase-alphanumeric strings starting
 * with "c". We validate shape loosely (non-empty string) rather than
 * Zod's stricter `.cuid()` format check, since that check is tied to a
 * specific cuid version and would break if the ID strategy ever changes. */
export const IdSchema = z.string().min(1);

/** Wire format for every DateTime field: an ISO-8601 string (how
 * `JSON.stringify` serialises a JS `Date`, and what `new Date(x)` parses
 * back losslessly on the client). */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** A calendar date with no time component, e.g. "2026-09-20" — used for
 * custodyStartDate/nextHearingDate-style fields where the rules-engine's
 * day-boundary math (spec §6.2) only ever cares about the date part. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");

/** `:id`-style single-param route validation, reused by every module's
 * `GET/PATCH /resource/:id`-shaped routes. */
export const IdParamSchema = z.object({ id: IdSchema }).strict();
export type IdParam = z.infer<typeof IdParamSchema>;
