import type { Role } from "./enums.js";

/**
 * The RBAC capability matrix from spec §8.3, "implement as data, not
 * scattered `if`s". Both the API's `requireRole`/`assertCanAccessCase`
 * middleware (Phase 3+) and the web app's navigation/route guards
 * (Phase 8+) read from this single source of truth so the two layers can
 * never silently drift apart.
 *
 * IMPORTANT (spec §8.4): this matrix is what the *UI* uses to decide what
 * to show. It must never be the only enforcement — every capability here
 * has a matching server-side check. Hiding a button in React is
 * insufficient on its own.
 */
export type Capability =
  | "VIEW_ANY_CASE"
  | "CREATE_EDIT_CASE"
  | "ASSIGN_CASE"
  | "RECORD_CASE_ACTIVITY" // hearing / task / document
  | "MANAGE_USERS"
  | "CONFIGURE_RULES"
  | "VIEW_FULL_PRIORITY_QUEUE"
  | "VIEW_AUDIT_LOG"
  | "EXPORT_REPORTS";

/**
 * `true` = full access. `"scoped"` = access limited to the actor's own
 * assignment (case owner for LEGAL_PROFESSIONAL, own scope for exports) —
 * the scoping rule itself lives in the service layer, since "own" means
 * something different per capability (assigned cases vs. own report
 * exports vs. own case's audit entries).
 */
export type CapabilityGrant = boolean | "scoped";

export const RBAC_MATRIX: Record<Role, Record<Capability, CapabilityGrant>> = {
  ADMIN: {
    VIEW_ANY_CASE: true,
    CREATE_EDIT_CASE: true,
    ASSIGN_CASE: true,
    RECORD_CASE_ACTIVITY: true,
    MANAGE_USERS: true,
    CONFIGURE_RULES: true,
    VIEW_FULL_PRIORITY_QUEUE: true,
    VIEW_AUDIT_LOG: true,
    EXPORT_REPORTS: true,
  },
  LEGAL_PROFESSIONAL: {
    VIEW_ANY_CASE: "scoped",
    CREATE_EDIT_CASE: "scoped",
    ASSIGN_CASE: false,
    RECORD_CASE_ACTIVITY: "scoped",
    MANAGE_USERS: false,
    CONFIGURE_RULES: false,
    VIEW_FULL_PRIORITY_QUEUE: "scoped",
    VIEW_AUDIT_LOG: "scoped",
    EXPORT_REPORTS: "scoped",
  },
  AUDITOR: {
    VIEW_ANY_CASE: true, // read-only — enforced by RECORD_CASE_ACTIVITY being false
    CREATE_EDIT_CASE: false,
    ASSIGN_CASE: false,
    RECORD_CASE_ACTIVITY: false,
    MANAGE_USERS: false,
    CONFIGURE_RULES: false,
    VIEW_FULL_PRIORITY_QUEUE: true,
    VIEW_AUDIT_LOG: true,
    EXPORT_REPORTS: true,
  },
};

/** `true` only for an unconditional grant; a `"scoped"` grant still needs
 * the caller to run the entity-specific ownership check. */
export function hasCapability(role: Role, capability: Capability): boolean {
  return RBAC_MATRIX[role][capability] !== false;
}

/** `true` when the grant is unconditional (no ownership check needed). */
export function hasUnscopedCapability(role: Role, capability: Capability): boolean {
  return RBAC_MATRIX[role][capability] === true;
}
