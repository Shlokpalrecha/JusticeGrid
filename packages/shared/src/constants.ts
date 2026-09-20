/**
 * Shared constants used by both the API and web app.
 */

/** All date/time maths in the system is calendar-day based in this
 * timezone (spec §6.2, §13). The rules-engine package itself never reads
 * this — it receives already-normalised dates — but the API layer that
 * feeds it, and any UI formatting, must agree on this zone. */
export const APP_TIMEZONE = "Asia/Kolkata";

/** Default ruleset thresholds (spec §6.4), mirrored here so the web app's
 * rules admin screen can show sensible defaults before the real
 * RulesetConfig loads. */
export const DEFAULT_HIGH_THRESHOLD = 7;
export const DEFAULT_MEDIUM_THRESHOLD = 3;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

/** Auth token lifetimes referenced by the web app for its own client-side
 * expiry bookkeeping (spec §8.2). The API is the source of truth; these
 * are fallback defaults matching .env.example. */
export const DEFAULT_ACCESS_TOKEN_TTL = "15m";
export const DEFAULT_REFRESH_TOKEN_TTL = "7d";

/**
 * Vocabulary guardrail (spec §1.2). This system prioritizes *workflow
 * attention*, never people. Code, copy, and commit messages must draw
 * language only from this list when describing what a priority score
 * means — never "risk score", "bail recommendation", "release
 * likelihood", "prisoner score", or "threat level".
 */
export const ALLOWED_PRIORITY_VOCABULARY = [
  "workflow priority",
  "review queue",
  "triggered condition",
  "pending action",
  "time-sensitive",
] as const;

/** The persistent disclaimer required on every authenticated page (spec
 * §1.8). Defined once here so the banner text can never drift between
 * the layout component and anywhere else it might be echoed (e.g. PDF/CSV
 * exports, the About page). */
export const PROTOTYPE_DISCLAIMER =
  "Prototype — synthetic data only. Workflow prioritization is a review aid, not a legal or judicial decision. All actions require human review.";
