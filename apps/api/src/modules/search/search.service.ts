import type { Role } from "@prisma/client";
import type { SearchResponse } from "@justicegrid/shared";
import { hasUnscopedCaseVisibility } from "../../lib/caseAccess.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
  role: Role;
}

const RESULT_LIMIT = 10;

/**
 * `GET /search?q=` (spec §7): cross-entity, respecting the same
 * authorization scoping each entity's own list endpoint applies — a
 * LEGAL_PROFESSIONAL's results are limited to their own assigned cases
 * (and, transitively, tasks on those cases); persons are scoped to
 * those with at least one case the actor can see, since a person row
 * has no owner of its own to scope by directly.
 */
export async function search(actor: ActorContext, q: string): Promise<SearchResponse> {
  const unscoped = hasUnscopedCaseVisibility(actor.role);
  const caseWhere = unscoped ? { deletedAt: null } : { deletedAt: null, assignedToId: actor.id };

  const [caseRows, taskRows, personRows] = await Promise.all([
    prisma.case.findMany({
      where: {
        ...caseWhere,
        OR: [
          { caseRef: { contains: q, mode: "insensitive" } },
          { courtName: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { person: { select: { aliasCode: true } } },
      take: RESULT_LIMIT,
    }),
    prisma.task.findMany({
      where: {
        title: { contains: q, mode: "insensitive" },
        ...(unscoped ? {} : { case: { assignedToId: actor.id, deletedAt: null } }),
      },
      include: { case: { select: { caseRef: true } } },
      take: RESULT_LIMIT,
    }),
    prisma.person.findMany({
      where: {
        OR: [
          { aliasCode: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
        ...(unscoped ? {} : { cases: { some: { assignedToId: actor.id, deletedAt: null } } }),
      },
      take: RESULT_LIMIT,
    }),
  ]);

  return {
    cases: caseRows.map((c) => ({
      id: c.id,
      caseRef: c.caseRef,
      courtName: c.courtName,
      caseStatus: c.caseStatus,
      personAlias: c.person.aliasCode,
      priorityLevel: c.currentPriorityLevel,
    })),
    persons: personRows.map((p) => ({
      id: p.id,
      aliasCode: p.aliasCode,
      displayName: p.displayName,
    })),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      caseId: t.caseId,
      caseRef: t.case.caseRef,
      status: t.status,
      dueDate: t.dueDate.toISOString(),
    })),
  };
}
