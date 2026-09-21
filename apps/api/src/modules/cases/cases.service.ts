import type { Case, User } from "@prisma/client";
import {
  AppError,
  type AuditLogDto,
  type CaseAggregateDto,
  type CaseArchiveInput,
  type CaseAssignInput,
  type CaseCreateInput,
  type CaseDto,
  type CaseFilterQuery,
  type CaseListItemDto,
  type CaseNoteCreateInput,
  type CaseNoteDto,
  type ChargeCreateInput,
  type ChargeDto,
  type TimelineEventDto,
} from "@justicegrid/shared";
import type { AuditActor, AuditRequestContext } from "../../lib/audit.js";
import { toAuditLogDto, writeAuditEntry } from "../../lib/audit.js";
import { hasUnscopedCaseVisibility, loadAccessibleCase } from "../../lib/caseAccess.js";
import { touchCaseActivity } from "../../lib/caseActivity.js";
import {
  CASE_REQUIRED_FIELDS,
  computeRequiredFieldsPresent,
} from "../../lib/caseFieldCompleteness.js";
import { createNotification, shouldNotify } from "../../lib/notifications.js";
import { toSkipTake } from "../../lib/pagination.js";
import { evaluateAndPersistCase } from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";
import { toPersonDto } from "../persons/persons.service.js";

function toUserRef(user: Pick<User, "id" | "fullName" | "role"> | null) {
  if (!user) return null;
  return { id: user.id, fullName: user.fullName, role: user.role };
}

export function toCaseDto(caseRow: Case): CaseDto {
  return {
    id: caseRow.id,
    caseRef: caseRow.caseRef,
    personId: caseRow.personId,
    courtName: caseRow.courtName,
    courtType: caseRow.courtType,
    district: caseRow.district,
    state: caseRow.state,
    policeStationAlias: caseRow.policeStationAlias,
    firNumberSynthetic: caseRow.firNumberSynthetic,
    firYear: caseRow.firYear,
    caseStatus: caseRow.caseStatus,
    custodyType: caseRow.custodyType,
    custodyStartDate: caseRow.custodyStartDate?.toISOString() ?? null,
    bailStatus: caseRow.bailStatus,
    bailAppliedDate: caseRow.bailAppliedDate?.toISOString() ?? null,
    assignedToId: caseRow.assignedToId,
    assignedAt: caseRow.assignedAt?.toISOString() ?? null,
    assignedById: caseRow.assignedById,
    createdById: caseRow.createdById,
    lastHearingDate: caseRow.lastHearingDate?.toISOString() ?? null,
    nextHearingDate: caseRow.nextHearingDate?.toISOString() ?? null,
    lastActivityAt: caseRow.lastActivityAt.toISOString(),
    currentPriorityLevel: caseRow.currentPriorityLevel,
    currentPriorityScore: caseRow.currentPriorityScore,
    lastEvaluatedAt: caseRow.lastEvaluatedAt?.toISOString() ?? null,
    isArchived: caseRow.isArchived,
    archivedReason: caseRow.archivedReason,
    createdAt: caseRow.createdAt.toISOString(),
    updatedAt: caseRow.updatedAt.toISOString(),
  };
}

function fieldCompleteness(
  caseRow: Case,
  chargeCount: number,
): CaseAggregateDto["fieldCompleteness"] {
  const present = computeRequiredFieldsPresent(caseRow, chargeCount);
  return {
    checkedFields: [...CASE_REQUIRED_FIELDS],
    missingFields: CASE_REQUIRED_FIELDS.filter((f) => !present[f]),
  };
}

interface ActorContext {
  id: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

function actorAuditInfo(actor: ActorContext, email: string): AuditActor {
  return { id: actor.id, email, role: actor.role };
}

export async function listCases(
  actor: ActorContext & { email: string },
  filter: CaseFilterQuery,
): Promise<{ items: CaseListItemDto[]; total: number }> {
  const where: Record<string, unknown> = { deletedAt: null };

  if (!hasUnscopedCaseVisibility(actor.role)) {
    where.assignedToId = actor.id;
  }
  if (filter.status) where.caseStatus = filter.status;
  if (filter.priority) where.currentPriorityLevel = filter.priority;
  if (filter.assignedTo) where.assignedToId = filter.assignedTo;
  if (filter.unassigned) where.assignedToId = null;
  if (filter.custodyType) where.custodyType = filter.custodyType;
  if (filter.bailStatus) where.bailStatus = filter.bailStatus;
  if (filter.district) where.district = filter.district;
  if (filter.court) where.courtName = filter.court;
  if (filter.hearingFrom || filter.hearingTo) {
    where.nextHearingDate = {
      ...(filter.hearingFrom ? { gte: new Date(filter.hearingFrom) } : {}),
      ...(filter.hearingTo ? { lte: new Date(filter.hearingTo) } : {}),
    };
  }
  if (filter.q) {
    where.OR = [
      { caseRef: { contains: filter.q, mode: "insensitive" } },
      { courtName: { contains: filter.q, mode: "insensitive" } },
    ];
  }

  const orderBy =
    filter.sort === "nextHearing"
      ? [{ nextHearingDate: "asc" as const }]
      : filter.sort === "caseRef"
        ? [{ caseRef: "asc" as const }]
        : filter.sort === "createdAt"
          ? [{ createdAt: "desc" as const }]
          : [{ currentPriorityScore: "desc" as const }, { caseRef: "asc" as const }];

  const [rows, total] = await Promise.all([
    prisma.case.findMany({
      where,
      include: {
        person: true,
        assignedTo: { select: { id: true, fullName: true, role: true } },
      },
      orderBy,
      ...toSkipTake(filter),
    }),
    prisma.case.count({ where }),
  ]);

  let items: CaseListItemDto[] = rows.map((r) => ({
    ...toCaseDto(r),
    person: {
      id: r.person.id,
      aliasCode: r.person.aliasCode,
      displayName: r.person.displayName,
      ageBand: r.person.ageBand,
    },
    assignedTo: toUserRef(r.assignedTo),
  }));

  // hasOverdueTasks / missingDocuments need a per-case sub-query rather
  // than a single SQL WHERE clause (they're derived from child rows) —
  // applied as a post-filter here since the seed dataset size (spec
  // §10: ~200 cases) makes this negligible; a larger dataset would move
  // this into the query itself.
  if (filter.hasOverdueTasks || filter.missingDocuments) {
    const ids = items.map((i) => i.id);
    const [overdueCaseIds, missingDocCaseIds] = await Promise.all([
      filter.hasOverdueTasks
        ? prisma.task
            .findMany({
              where: {
                caseId: { in: ids },
                status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] },
                dueDate: { lt: new Date() },
              },
              select: { caseId: true },
              distinct: ["caseId"],
            })
            .then((rows2) => new Set(rows2.map((r) => r.caseId)))
        : null,
      filter.missingDocuments
        ? prisma.documentRequirement
            .findMany({
              where: {
                caseId: { in: ids },
                isMandatory: true,
                status: { in: ["MISSING", "REJECTED"] },
              },
              select: { caseId: true },
              distinct: ["caseId"],
            })
            .then((rows2) => new Set(rows2.map((r) => r.caseId)))
        : null,
    ]);
    if (overdueCaseIds) items = items.filter((i) => overdueCaseIds.has(i.id));
    if (missingDocCaseIds) items = items.filter((i) => missingDocCaseIds.has(i.id));
  }

  return { items, total };
}

export async function getCaseAggregate(
  actor: ActorContext,
  caseId: string,
): Promise<CaseAggregateDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);
  const [person, charges, assignedTo, createdBy] = await Promise.all([
    prisma.person.findUniqueOrThrow({ where: { id: caseRow.personId } }),
    prisma.charge.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } }),
    caseRow.assignedToId
      ? prisma.user.findUnique({
          where: { id: caseRow.assignedToId },
          select: { id: true, fullName: true, role: true },
        })
      : Promise.resolve(null),
    prisma.user.findUniqueOrThrow({
      where: { id: caseRow.createdById },
      select: { id: true, fullName: true, role: true },
    }),
  ]);

  return {
    ...toCaseDto(caseRow),
    person: toPersonDto(person),
    charges: charges.map(toChargeDto),
    assignedTo: toUserRef(assignedTo),
    createdBy: toUserRef(createdBy) as NonNullable<ReturnType<typeof toUserRef>>,
    fieldCompleteness: fieldCompleteness(caseRow, charges.length),
  };
}

function toChargeDto(charge: {
  id: string;
  caseId: string;
  actName: string;
  sectionCode: string;
  description: string | null;
  isBailableFlag: boolean;
  severityBand: string;
  createdAt: Date;
}): ChargeDto {
  return {
    id: charge.id,
    caseId: charge.caseId,
    actName: charge.actName,
    sectionCode: charge.sectionCode,
    description: charge.description,
    isBailableFlag: charge.isBailableFlag,
    severityBand: charge.severityBand,
    createdAt: charge.createdAt.toISOString(),
  };
}

/**
 * When a LEGAL_PROFESSIONAL creates a case, it is auto-assigned to them
 * — CREATE_EDIT_CASE is scoped to "assigned only" for that role (spec
 * §8.3), so a case they create but aren't assigned to would be one they
 * immediately can't act on. ADMIN's cases are created unassigned unless
 * a separate `POST /cases/:id/assign` follows, matching ADMIN's
 * unscoped access needing no auto-assignment.
 */
export async function createCase(
  actor: ActorContext & { email: string },
  input: CaseCreateInput,
  request: AuditRequestContext,
): Promise<CaseDto> {
  const person = await prisma.person.findUnique({ where: { id: input.personId } });
  if (!person) {
    throw new AppError("VALIDATION_ERROR", "personId does not reference an existing person.", [
      { field: "personId", issue: "No such person" },
    ]);
  }
  if (input.custodyStartDate) {
    validateNotFuture(input.custodyStartDate, "custodyStartDate");
  }

  const autoAssign = actor.role === "LEGAL_PROFESSIONAL";
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.create({
      data: {
        caseRef: input.caseRef,
        personId: input.personId,
        courtName: input.courtName,
        courtType: input.courtType,
        district: input.district,
        state: input.state,
        policeStationAlias: input.policeStationAlias,
        firNumberSynthetic: input.firNumberSynthetic,
        firYear: input.firYear,
        caseStatus: input.caseStatus,
        custodyType: input.custodyType,
        custodyStartDate: input.custodyStartDate ? new Date(input.custodyStartDate) : null,
        bailStatus: input.bailStatus,
        bailAppliedDate: input.bailAppliedDate ? new Date(input.bailAppliedDate) : null,
        createdById: actor.id,
        lastActivityAt: now,
        assignedToId: autoAssign ? actor.id : null,
        assignedAt: autoAssign ? now : null,
        assignedById: autoAssign ? actor.id : null,
      },
    });
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "CREATE",
      entityType: "Case",
      entityId: caseRow.id,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} created case ${caseRow.caseRef}`,
      after: caseRow,
    });
    if (autoAssign) {
      await tx.caseAssignmentHistory.create({
        data: {
          caseId: caseRow.id,
          fromUserId: null,
          toUserId: actor.id,
          changedById: actor.id,
          reason: "Auto-assigned to creator (legal professional)",
        },
      });
    }
    await evaluateAndPersistCase(tx, caseRow.id, { triggeredBy: "USER", triggeredById: actor.id });
    return caseRow;
  });

  return toCaseDto(created);
}

function validateNotFuture(isoDate: string, field: string): void {
  if (new Date(isoDate).getTime() > Date.now()) {
    throw new AppError("VALIDATION_ERROR", `${field} must not be in the future.`, [
      { field, issue: "must not be in the future" },
    ]);
  }
}

export async function updateCase(
  actor: ActorContext & { email: string },
  caseId: string,
  input: Partial<CaseCreateInput>,
  request: AuditRequestContext,
): Promise<CaseDto> {
  const existing = await loadAccessibleCase(prisma, actor, caseId);

  if (input.custodyStartDate) {
    validateNotFuture(input.custodyStartDate, "custodyStartDate");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.update({
      where: { id: caseId },
      data: {
        ...input,
        custodyStartDate: input.custodyStartDate ? new Date(input.custodyStartDate) : undefined,
        bailAppliedDate: input.bailAppliedDate ? new Date(input.bailAppliedDate) : undefined,
        lastActivityAt: new Date(),
      },
    });
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "UPDATE",
      entityType: "Case",
      entityId: caseRow.id,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} updated case ${caseRow.caseRef}`,
      before: existing,
      after: caseRow,
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return caseRow;
  });

  return toCaseDto(updated);
}

export async function assignCase(
  actor: ActorContext & { email: string },
  caseId: string,
  input: CaseAssignInput,
  request: AuditRequestContext,
): Promise<CaseDto> {
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing || existing.deletedAt) throw new AppError("NOT_FOUND", "Case not found.");

  const targetUser = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!targetUser || targetUser.deletedAt) {
    throw new AppError("VALIDATION_ERROR", "userId does not reference an existing user.", [
      { field: "userId", issue: "No such user" },
    ]);
  }
  if (!targetUser.isActive) {
    throw new AppError("VALIDATION_ERROR", "Cannot assign a case to an inactive user.", [
      { field: "userId", issue: "User is inactive" },
    ]);
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.update({
      where: { id: caseId },
      data: {
        assignedToId: targetUser.id,
        assignedAt: now,
        assignedById: actor.id,
        lastActivityAt: now,
      },
    });
    await tx.caseAssignmentHistory.create({
      data: {
        caseId,
        fromUserId: existing.assignedToId,
        toUserId: targetUser.id,
        changedById: actor.id,
        reason: input.reason,
      },
    });
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "ASSIGN",
      entityType: "Case",
      entityId: caseId,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} assigned case ${caseRow.caseRef} to ${targetUser.email}`,
      before: { assignedToId: existing.assignedToId },
      after: { assignedToId: targetUser.id },
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    if (shouldNotify(targetUser.id, actor.id)) {
      await createNotification(tx, {
        userId: targetUser.id,
        type: "CASE_ASSIGNED",
        title: "Case assigned to you",
        body: `${actor.email} assigned case ${caseRow.caseRef} to you.`,
        relatedEntityType: "Case",
        relatedEntityId: caseId,
      });
    }
    return caseRow;
  });

  return toCaseDto(updated);
}

export async function unassignCase(
  actor: ActorContext & { email: string },
  caseId: string,
  request: AuditRequestContext,
): Promise<CaseDto> {
  const existing = await prisma.case.findUnique({ where: { id: caseId } });
  if (!existing || existing.deletedAt) throw new AppError("NOT_FOUND", "Case not found.");

  const updated = await prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.update({
      where: { id: caseId },
      data: {
        assignedToId: null,
        assignedAt: null,
        assignedById: null,
        lastActivityAt: new Date(),
      },
    });
    await tx.caseAssignmentHistory.create({
      data: {
        caseId,
        fromUserId: existing.assignedToId,
        toUserId: null,
        changedById: actor.id,
        reason: "Unassigned",
      },
    });
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "UNASSIGN",
      entityType: "Case",
      entityId: caseId,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} unassigned case ${caseRow.caseRef}`,
      before: { assignedToId: existing.assignedToId },
      after: { assignedToId: null },
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return caseRow;
  });

  return toCaseDto(updated);
}

export async function archiveCase(
  actor: ActorContext & { email: string },
  caseId: string,
  input: CaseArchiveInput,
  request: AuditRequestContext,
): Promise<CaseDto> {
  const existing = await loadAccessibleCase(prisma, actor, caseId);

  const updated = await prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.update({
      where: { id: caseId },
      data: { isArchived: true, archivedReason: input.archivedReason, lastActivityAt: new Date() },
    });
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "STATUS_CHANGE",
      entityType: "Case",
      entityId: caseId,
      entityLabel: caseRow.caseRef,
      summary: `${actor.email} archived case ${caseRow.caseRef}: ${input.archivedReason}`,
      before: { isArchived: existing.isArchived },
      after: { isArchived: true, archivedReason: input.archivedReason },
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return caseRow;
  });

  return toCaseDto(updated);
}

export async function listCharges(actor: ActorContext, caseId: string): Promise<ChargeDto[]> {
  await loadAccessibleCase(prisma, actor, caseId);
  const charges = await prisma.charge.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
  return charges.map(toChargeDto);
}

export async function addCharge(
  actor: ActorContext & { email: string },
  caseId: string,
  input: ChargeCreateInput,
  request: AuditRequestContext,
): Promise<ChargeDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const charge = await prisma.$transaction(async (tx) => {
    const c = await tx.charge.create({
      data: {
        caseId,
        actName: input.actName,
        sectionCode: input.sectionCode,
        description: input.description,
        isBailableFlag: input.isBailableFlag,
        severityBand: input.severityBand,
      },
    });
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "CREATE",
      entityType: "Charge",
      entityId: c.id,
      entityLabel: `${c.actName} ${c.sectionCode}`,
      summary: `${actor.email} added a charge to case ${caseRow.caseRef}`,
      after: c,
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return c;
  });

  return toChargeDto(charge);
}

export async function addCaseNote(
  actor: ActorContext & { email: string },
  caseId: string,
  input: CaseNoteCreateInput,
  request: AuditRequestContext,
): Promise<CaseNoteDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const note = await prisma.$transaction(async (tx) => {
    const n = await tx.caseNote.create({
      data: { caseId, authorId: actor.id, body: input.body, isInternal: input.isInternal },
    });
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actorAuditInfo(actor, actor.email), request, {
      action: "CREATE",
      entityType: "CaseNote",
      entityId: n.id,
      entityLabel: `Note on ${caseRow.caseRef}`,
      summary: `${actor.email} added a note to case ${caseRow.caseRef}`,
      after: { body: n.body, isInternal: n.isInternal },
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return n;
  });

  return {
    id: note.id,
    caseId: note.caseId,
    authorId: note.authorId,
    body: note.body,
    isInternal: note.isInternal,
    createdAt: note.createdAt.toISOString(),
  };
}

export async function getCaseTimeline(
  actor: ActorContext,
  caseId: string,
): Promise<TimelineEventDto[]> {
  await loadAccessibleCase(prisma, actor, caseId);

  const [hearings, tasks, documents, notes] = await Promise.all([
    prisma.hearing.findMany({ where: { caseId } }),
    prisma.task.findMany({ where: { caseId } }),
    prisma.documentRequirement.findMany({ where: { caseId } }),
    prisma.caseNote.findMany({ where: { caseId } }),
  ]);

  const events: TimelineEventDto[] = [
    ...hearings.map((h) => ({
      type: "HEARING" as const,
      id: h.id,
      occurredAt: h.scheduledDate.toISOString(),
      summary: `${h.hearingType} hearing — ${h.outcome}`,
      detail: { outcome: h.outcome, orderReviewed: h.orderReviewed },
    })),
    ...tasks.map((t) => ({
      type: "TASK" as const,
      id: t.id,
      occurredAt: t.createdAt.toISOString(),
      summary: `Task: ${t.title} (${t.status})`,
      detail: { status: t.status, dueDate: t.dueDate.toISOString() },
    })),
    ...documents.map((d) => ({
      type: "DOCUMENT" as const,
      id: d.id,
      occurredAt: d.updatedAt.toISOString(),
      summary: `${d.documentType}: ${d.status}`,
      detail: { status: d.status, isMandatory: d.isMandatory },
    })),
    ...notes.map((n) => ({
      type: "NOTE" as const,
      id: n.id,
      occurredAt: n.createdAt.toISOString(),
      summary: n.body.slice(0, 80),
      detail: { isInternal: n.isInternal },
    })),
  ];

  return events.sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );
}

export async function getCaseAudit(actor: ActorContext, caseId: string): Promise<AuditLogDto[]> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const [hearingIds, taskIds, docIds, noteIds, chargeIds] = await Promise.all([
    prisma.hearing.findMany({ where: { caseId }, select: { id: true } }),
    prisma.task.findMany({ where: { caseId }, select: { id: true } }),
    prisma.documentRequirement.findMany({ where: { caseId }, select: { id: true } }),
    prisma.caseNote.findMany({ where: { caseId }, select: { id: true } }),
    prisma.charge.findMany({ where: { caseId }, select: { id: true } }),
  ]);

  const entries = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Case", entityId: caseRow.id },
        { entityType: "Hearing", entityId: { in: hearingIds.map((h) => h.id) } },
        { entityType: "Task", entityId: { in: taskIds.map((t) => t.id) } },
        { entityType: "DocumentRequirement", entityId: { in: docIds.map((d) => d.id) } },
        { entityType: "CaseNote", entityId: { in: noteIds.map((n) => n.id) } },
        { entityType: "Charge", entityId: { in: chargeIds.map((c) => c.id) } },
      ],
    },
    orderBy: { sequence: "desc" },
  });

  return entries.map(toAuditLogDto);
}
