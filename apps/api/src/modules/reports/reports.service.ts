import type { Role } from "@prisma/client";
import {
  AppError,
  type CaseAgingRow,
  type CompletedTaskRow,
  type OverdueActionRow,
  type PendingByUserRow,
  type PriorityDistribution,
  type ReportExportQuery,
  type ReportName,
  type ActionFrequencyRow,
  type UpcomingHearingRow,
} from "@justicegrid/shared";
import { hasUnscopedCaseVisibility } from "../../lib/caseAccess.js";
import { type CsvValue, toCsv } from "../../lib/csv.js";
import { prisma } from "../../lib/prisma.js";
import { getDistribution, refreshScope } from "../priority/priority.service.js";

interface ActorContext {
  id: string;
  email: string;
  role: Role;
}

const OPEN_TASK_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED"] as const;

/** All non-CSV report queries share the same scoping rule as their
 * underlying entity: a LEGAL_PROFESSIONAL's EXPORT_REPORTS grant is
 * `"scoped"` (spec §8.3), meaning "your own assigned cases only" — the
 * same rule `hasUnscopedCaseVisibility` already encodes for case
 * lists/queues/search. */
function caseScopeWhere(actor: ActorContext): Record<string, unknown> {
  return hasUnscopedCaseVisibility(actor.role)
    ? { deletedAt: null }
    : { deletedAt: null, assignedToId: actor.id };
}

/** `GET /reports/pending-by-user` (spec §7). */
export async function getPendingByUser(actor: ActorContext): Promise<PendingByUserRow[]> {
  const tasks = await prisma.task.findMany({
    where: {
      status: { in: [...OPEN_TASK_STATUSES] },
      case: caseScopeWhere(actor),
    },
    include: { assignedTo: { select: { id: true, fullName: true, role: true } } },
  });

  const byUser = new Map<
    string,
    {
      userId: string | null;
      userName: string;
      role: Role | null;
      pending: number;
      inProgress: number;
      blocked: number;
    }
  >();

  for (const task of tasks) {
    const key = task.assignedToId ?? "__unassigned__";
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: task.assignedTo?.id ?? null,
        userName: task.assignedTo?.fullName ?? "Unassigned",
        role: task.assignedTo?.role ?? null,
        pending: 0,
        inProgress: 0,
        blocked: 0,
      });
    }
    const entry = byUser.get(key)!;
    if (task.status === "PENDING") entry.pending += 1;
    else if (task.status === "IN_PROGRESS") entry.inProgress += 1;
    else if (task.status === "BLOCKED") entry.blocked += 1;
  }

  return [...byUser.values()]
    .map((e) => ({
      userId: e.userId,
      userName: e.userName,
      role: e.role,
      pendingCount: e.pending,
      inProgressCount: e.inProgress,
      blockedCount: e.blocked,
      totalOpen: e.pending + e.inProgress + e.blocked,
    }))
    .sort((a, b) => b.totalOpen - a.totalOpen);
}

/** `GET /reports/upcoming-hearings?days=` (spec §7). */
export async function getUpcomingHearings(
  actor: ActorContext,
  days: number,
): Promise<UpcomingHearingRow[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);

  const hearings = await prisma.hearing.findMany({
    where: {
      scheduledDate: { gte: now, lte: until },
      outcome: { not: "CANCELLED" },
      case: caseScopeWhere(actor),
    },
    include: {
      case: { select: { id: true, caseRef: true, assignedTo: { select: { fullName: true } } } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  return hearings.map((h) => ({
    hearingId: h.id,
    caseId: h.case.id,
    caseRef: h.case.caseRef,
    scheduledDate: h.scheduledDate.toISOString(),
    hearingType: h.hearingType,
    assignedTo: h.case.assignedTo?.fullName ?? null,
  }));
}

/** `GET /reports/overdue-actions` (spec §7). */
export async function getOverdueActions(actor: ActorContext): Promise<OverdueActionRow[]> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: [...OPEN_TASK_STATUSES] },
      dueDate: { lt: now },
      case: caseScopeWhere(actor),
    },
    include: { case: { select: { caseRef: true } }, assignedTo: { select: { fullName: true } } },
    orderBy: { dueDate: "asc" },
  });

  return tasks.map((t) => ({
    taskId: t.id,
    caseId: t.caseId,
    caseRef: t.case.caseRef,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate.toISOString(),
    daysOverdue: Math.floor((now.getTime() - t.dueDate.getTime()) / 86_400_000),
    assignedTo: t.assignedTo?.fullName ?? null,
  }));
}

/** `GET /reports/priority-distribution` (spec §7) — reuses the same
 * scoped aggregate `GET /priority/distribution` already computes, rather
 * than a second, possibly-drifting copy of that query. */
export async function getPriorityDistributionReport(
  actor: ActorContext,
): Promise<PriorityDistribution> {
  return getDistribution(actor);
}

/** `GET /reports/completed?from=&to=` (spec §7). Both bounds optional —
 * an absent `from`/`to` simply leaves that side of the range open. */
export async function getCompleted(
  actor: ActorContext,
  from?: string,
  to?: string,
): Promise<CompletedTaskRow[]> {
  const tasks = await prisma.task.findMany({
    where: {
      status: "COMPLETED",
      completedAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      },
      case: caseScopeWhere(actor),
    },
    include: { case: { select: { caseRef: true } }, completedBy: { select: { fullName: true } } },
    orderBy: { completedAt: "desc" },
  });

  return tasks.map((t) => ({
    taskId: t.id,
    caseId: t.caseId,
    caseRef: t.case.caseRef,
    title: t.title,
    completedAt: t.completedAt!.toISOString(),
    completedBy: t.completedBy?.fullName ?? null,
  }));
}

/** `GET /reports/case-aging` (spec §7): every open case's time in
 * custody, oldest first — cases without a recorded `custodyStartDate`
 * sort last (spec §6.5's "nulls last" convention, reused here). */
export async function getCaseAging(actor: ActorContext): Promise<CaseAgingRow[]> {
  const now = Date.now();
  const cases = await prisma.case.findMany({
    where: { ...caseScopeWhere(actor), isArchived: false },
    include: { assignedTo: { select: { fullName: true } } },
  });

  return cases
    .map((c) => ({
      caseId: c.id,
      caseRef: c.caseRef,
      custodyStartDate: c.custodyStartDate?.toISOString() ?? null,
      daysInCustody: c.custodyStartDate
        ? Math.floor((now - c.custodyStartDate.getTime()) / 86_400_000)
        : null,
      priorityLevel: c.currentPriorityLevel,
      assignedTo: c.assignedTo?.fullName ?? null,
    }))
    .sort((a, b) => {
      if (a.daysInCustody === null) return 1;
      if (b.daysInCustody === null) return -1;
      return b.daysInCustody - a.daysInCustody;
    });
}

/** `GET /reports/action-frequency` (spec §7): tallies how many
 * cases' CURRENT (latest) evaluation includes each rule — one row per
 * `PriorityEvaluation` per case via Prisma's `distinct` + matching
 * `orderBy`, the standard "latest row per group" pattern. */
export async function getActionFrequency(actor: ActorContext): Promise<ActionFrequencyRow[]> {
  await refreshScope(actor);
  const caseIds = (
    await prisma.case.findMany({ where: caseScopeWhere(actor), select: { id: true } })
  ).map((c) => c.id);
  if (caseIds.length === 0) return [];

  const rows = await prisma.queueEvaluation.findMany({
    where: { caseId: { in: caseIds } },
    orderBy: [{ caseId: "asc" }, { evaluatedAt: "desc" }],
    distinct: ["caseId"],
  });
  const tally = new Map<string, { actionName: string; count: number }>();
  for (const row of rows) {
    const evaluation = row.result as unknown as { actions: { type: string; title: string }[] };
    for (const type of new Set(evaluation.actions.map((a) => a.type))) {
      const name = evaluation.actions.find((a) => a.type === type)!.title;
      const entry = tally.get(type) ?? { actionName: name, count: 0 };
      entry.count++;
      tally.set(type, entry);
    }
  }
  return [...tally.entries()]
    .map(([actionType, { actionName, count }]) => ({ actionType, actionName, triggerCount: count }))
    .sort((a, b) => b.triggerCount - a.triggerCount);
}

/**
 * `GET /reports/:name/export.csv` (spec §7): dispatches to the same
 * data-fetching function each named report's own GET endpoint uses, so
 * the CSV export can never silently drift from the JSON response — then
 * flattens the result through `lib/csv.ts`'s serializer.
 */
export async function getReportCsv(
  actor: ActorContext,
  name: ReportName,
  query: ReportExportQuery,
): Promise<string> {
  switch (name) {
    case "pending-by-user": {
      const rows = await getPendingByUser(actor);
      return toCsv(
        ["User", "Role", "Pending", "In Progress", "Blocked", "Total Open"],
        rows.map((r): CsvValue[] => [
          r.userName,
          r.role,
          r.pendingCount,
          r.inProgressCount,
          r.blockedCount,
          r.totalOpen,
        ]),
      );
    }
    case "upcoming-hearings": {
      const rows = await getUpcomingHearings(actor, query.days ?? 7);
      return toCsv(
        ["Case Ref", "Hearing Type", "Scheduled Date", "Assigned To"],
        rows.map((r): CsvValue[] => [r.caseRef, r.hearingType, r.scheduledDate, r.assignedTo]),
      );
    }
    case "overdue-actions": {
      const rows = await getOverdueActions(actor);
      return toCsv(
        ["Case Ref", "Task", "Status", "Due Date", "Days Overdue", "Assigned To"],
        rows.map((r): CsvValue[] => [
          r.caseRef,
          r.title,
          r.status,
          r.dueDate,
          r.daysOverdue,
          r.assignedTo,
        ]),
      );
    }
    case "priority-distribution": {
      const dist = await getPriorityDistributionReport(actor);
      return toCsv(
        ["Priority Level", "Count"],
        [
          ["U0", dist.U0],
          ["U1", dist.U1],
          ["U2", dist.U2],
          ["U3", dist.U3],
        ],
      );
    }
    case "completed": {
      const rows = await getCompleted(actor, query.from, query.to);
      return toCsv(
        ["Case Ref", "Task", "Completed At", "Completed By"],
        rows.map((r): CsvValue[] => [r.caseRef, r.title, r.completedAt, r.completedBy]),
      );
    }
    case "case-aging": {
      const rows = await getCaseAging(actor);
      return toCsv(
        ["Case Ref", "Custody Start Date", "Days In Custody", "Priority Level", "Assigned To"],
        rows.map((r): CsvValue[] => [
          r.caseRef,
          r.custodyStartDate,
          r.daysInCustody,
          r.priorityLevel,
          r.assignedTo,
        ]),
      );
    }
    case "action-frequency": {
      const rows = await getActionFrequency(actor);
      return toCsv(
        ["Action Category", "Action Name", "Case Count"],
        rows.map((r): CsvValue[] => [r.actionType, r.actionName, r.triggerCount]),
      );
    }
    default: {
      const exhaustiveCheck: never = name;
      throw new AppError("VALIDATION_ERROR", `Unknown report: ${String(exhaustiveCheck)}`, [
        { field: "name", issue: "Unknown report name" },
      ]);
    }
  }
}
