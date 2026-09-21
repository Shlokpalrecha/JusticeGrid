import type { Task } from "@prisma/client";
import {
  AppError,
  type TaskCompleteInput,
  type TaskCreateInput,
  type TaskDto,
  type TaskFilterQuery,
  type TaskListItemDto,
  type TaskReassignInput,
  type TaskUpdateInput,
} from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { hasUnscopedCaseVisibility, loadAccessibleCase } from "../../lib/caseAccess.js";
import { touchCaseActivity } from "../../lib/caseActivity.js";
import { toSkipTake } from "../../lib/pagination.js";
import { evaluateAndPersistCase } from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
  email: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

export function toTaskDto(t: Task): TaskDto {
  return {
    id: t.id,
    caseId: t.caseId,
    title: t.title,
    description: t.description,
    category: t.category,
    assignedToId: t.assignedToId,
    createdById: t.createdById,
    dueDate: t.dueDate.toISOString(),
    status: t.status,
    blockedReason: t.blockedReason,
    blockedSince: t.blockedSince?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedById: t.completedById,
    completionNote: t.completionNote,
    cancelledReason: t.cancelledReason,
    isPreparationTask: t.isPreparationTask,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTasks(
  actor: ActorContext,
  filter: TaskFilterQuery,
): Promise<{ items: TaskListItemDto[]; total: number }> {
  const where: Record<string, unknown> = {};

  if (!hasUnscopedCaseVisibility(actor.role)) {
    where.case = { assignedToId: actor.id };
  }
  if (filter.assignedTo === "me") {
    where.assignedToId = actor.id;
  } else if (filter.assignedTo) {
    where.assignedToId = filter.assignedTo;
  }
  if (filter.status) where.status = filter.status;
  if (filter.category) where.category = filter.category;
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.dueBefore) where.dueDate = { lt: new Date(filter.dueBefore) };
  if (filter.overdue) {
    where.status = { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] };
    where.dueDate = { lt: new Date() };
  }

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: { case: { select: { caseRef: true } } },
      orderBy: { dueDate: "asc" },
      ...toSkipTake(filter),
    }),
    prisma.task.count({ where }),
  ]);

  return {
    items: rows.map((t) => ({ ...toTaskDto(t), caseRef: t.case.caseRef })),
    total,
  };
}

export async function getMyTaskQueue(actor: ActorContext): Promise<TaskListItemDto[]> {
  const rows = await prisma.task.findMany({
    where: { assignedToId: actor.id },
    include: { case: { select: { caseRef: true } } },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((t) => ({ ...toTaskDto(t), caseRef: t.case.caseRef }));
}

export async function createTask(
  actor: ActorContext,
  caseId: string,
  input: TaskCreateInput,
  request: AuditRequestContext,
): Promise<TaskDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        caseId,
        title: input.title,
        description: input.description,
        category: input.category,
        assignedToId: input.assignedToId,
        createdById: actor.id,
        dueDate: new Date(input.dueDate),
        isPreparationTask: input.isPreparationTask,
      },
    });
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "Task",
      entityId: t.id,
      entityLabel: t.title,
      summary: `${actor.email} created task "${t.title}" on case ${caseRow.caseRef}`,
      after: t,
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return t;
  });

  return toTaskDto(task);
}

export async function updateTask(
  actor: ActorContext,
  taskId: string,
  input: TaskUpdateInput,
  request: AuditRequestContext,
): Promise<TaskDto> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw new AppError("NOT_FOUND", "Task not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  if (existing.status === "CANCELLED" && input.status && input.status !== "CANCELLED") {
    throw new AppError("VALIDATION_ERROR", "A cancelled task cannot be reopened via update.", [
      { field: "status", issue: "Task is cancelled" },
    ]);
  }

  // blockedSince (spec §6.1's TaskInput contract — not itself in spec
  // §5's Task field list, added in a follow-up migration; see
  // schema.prisma) is derived from the status transition, not settable
  // directly: it starts counting the moment a task becomes BLOCKED, and
  // clears the moment it stops being BLOCKED.
  let blockedSince: Date | null | undefined;
  if (input.status === "BLOCKED" && existing.status !== "BLOCKED") {
    blockedSince = new Date();
  } else if (input.status && input.status !== "BLOCKED" && existing.status === "BLOCKED") {
    blockedSince = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: taskId },
      data: {
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        blockedSince,
      },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "UPDATE",
      entityType: "Task",
      entityId: t.id,
      entityLabel: t.title,
      summary: `${actor.email} updated task "${t.title}" on case ${caseRow.caseRef}`,
      before: existing,
      after: t,
    });
    await evaluateAndPersistCase(tx, existing.caseId, {
      triggeredBy: "USER",
      triggeredById: actor.id,
    });
    return t;
  });

  return toTaskDto(updated);
}

/** spec §8.5: cannot complete a CANCELLED task. */
export async function completeTask(
  actor: ActorContext,
  taskId: string,
  input: TaskCompleteInput,
  request: AuditRequestContext,
): Promise<TaskDto> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw new AppError("NOT_FOUND", "Task not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  if (existing.status === "CANCELLED") {
    throw new AppError("VALIDATION_ERROR", "Cannot complete a cancelled task.", [
      { field: "status", issue: "Task is cancelled" },
    ]);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: actor.id,
        completionNote: input.completionNote,
      },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "STATUS_CHANGE",
      entityType: "Task",
      entityId: t.id,
      entityLabel: t.title,
      summary: `${actor.email} completed task "${t.title}" on case ${caseRow.caseRef}`,
      before: { status: existing.status },
      after: { status: "COMPLETED" },
    });
    await evaluateAndPersistCase(tx, existing.caseId, {
      triggeredBy: "USER",
      triggeredById: actor.id,
    });
    return t;
  });

  return toTaskDto(updated);
}

export async function reassignTask(
  actor: ActorContext,
  taskId: string,
  input: TaskReassignInput,
  request: AuditRequestContext,
): Promise<TaskDto> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw new AppError("NOT_FOUND", "Task not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  if (input.assignedToId) {
    const targetUser = await prisma.user.findUnique({ where: { id: input.assignedToId } });
    if (!targetUser || targetUser.deletedAt) {
      throw new AppError("VALIDATION_ERROR", "assignedToId does not reference an existing user.", [
        { field: "assignedToId", issue: "No such user" },
      ]);
    }
    if (!targetUser.isActive) {
      throw new AppError("VALIDATION_ERROR", "Cannot assign a task to an inactive user.", [
        { field: "assignedToId", issue: "User is inactive" },
      ]);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: taskId },
      data: { assignedToId: input.assignedToId },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "ASSIGN",
      entityType: "Task",
      entityId: t.id,
      entityLabel: t.title,
      summary: `${actor.email} reassigned task "${t.title}" on case ${caseRow.caseRef}`,
      before: { assignedToId: existing.assignedToId },
      after: { assignedToId: input.assignedToId },
    });
    await evaluateAndPersistCase(tx, existing.caseId, {
      triggeredBy: "USER",
      triggeredById: actor.id,
    });
    return t;
  });

  return toTaskDto(updated);
}
