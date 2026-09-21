import type { Case, Prisma, PrismaClient, Role } from "@prisma/client";
import { AppError } from "@justicegrid/shared";

/**
 * Resource-level ownership check — the SECOND of spec §8.4's two
 * authorization layers. Route-level `requireCapability` only confirms
 * the actor's ROLE may in principle perform this kind of action; for a
 * `"scoped"` grant (LEGAL_PROFESSIONAL), this confirms the SPECIFIC case
 * is one they're allowed to touch (currently: they're its assignedToId).
 * ADMIN bypasses this check (full access per the matrix); AUDITOR is
 * read-only everywhere it's granted access at all, so it bypasses too —
 * its route guards already restrict it to GET-only capabilities, this
 * function only adds the ownership *scoping*, not a write/read
 * distinction.
 *
 * Returns the case row so callers that need it right after the check
 * (nearly all of them) don't re-fetch it.
 */
export async function loadAccessibleCase(
  client: Prisma.TransactionClient | PrismaClient,
  actor: { id: string; role: Role },
  caseId: string,
): Promise<Case> {
  const caseRow = await client.case.findUnique({ where: { id: caseId } });
  if (!caseRow || caseRow.deletedAt) {
    throw new AppError("NOT_FOUND", "Case not found.");
  }
  if (actor.role === "LEGAL_PROFESSIONAL" && caseRow.assignedToId !== actor.id) {
    throw new AppError("FORBIDDEN", "You are not assigned to this case.");
  }
  return caseRow;
}

/** `true` when `role` sees every case unscoped (ADMIN, AUDITOR); `false`
 * when list/search/report queries must filter to `assignedToId = actor`
 * (LEGAL_PROFESSIONAL) — spec §8.4: a restricted case must not appear in
 * their list, search, queue, reports, or exports, not just be blocked on
 * direct fetch. */
export function hasUnscopedCaseVisibility(role: Role): boolean {
  return role === "ADMIN" || role === "AUDITOR";
}
