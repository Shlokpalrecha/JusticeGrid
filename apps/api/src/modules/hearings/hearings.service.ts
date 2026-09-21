import type { Hearing } from "@prisma/client";
import {
  AppError,
  type HearingCreateInput,
  type HearingDto,
  type HearingMarkOrderReviewedInput,
  type HearingUpdateInput,
  type UpcomingHearingItemDto,
} from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { hasUnscopedCaseVisibility, loadAccessibleCase } from "../../lib/caseAccess.js";
import { touchCaseActivity } from "../../lib/caseActivity.js";
import { recomputeCaseHearingDates } from "../../lib/caseHearingDates.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
  email: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

export function toHearingDto(h: Hearing): HearingDto {
  return {
    id: h.id,
    caseId: h.caseId,
    scheduledDate: h.scheduledDate.toISOString(),
    actualDate: h.actualDate?.toISOString() ?? null,
    hearingType: h.hearingType,
    purpose: h.purpose,
    outcome: h.outcome,
    wasProduced: h.wasProduced,
    adjournmentReason: h.adjournmentReason,
    orderSummary: h.orderSummary,
    orderReviewed: h.orderReviewed,
    orderReviewedAt: h.orderReviewedAt?.toISOString() ?? null,
    orderReviewedById: h.orderReviewedById,
    nextHearingDate: h.nextHearingDate?.toISOString() ?? null,
    recordedById: h.recordedById,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

/** spec §8.5: a hearing's scheduledDate must not be before the case's
 * custodyStartDate. */
function validateScheduledDate(scheduledDateIso: string, custodyStartDate: Date | null): void {
  if (custodyStartDate && new Date(scheduledDateIso).getTime() < custodyStartDate.getTime()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "scheduledDate must not be before the case's custodyStartDate.",
      [{ field: "scheduledDate", issue: "Before custodyStartDate" }],
    );
  }
}

export async function listHearingsForCase(
  actor: ActorContext,
  caseId: string,
): Promise<HearingDto[]> {
  await loadAccessibleCase(prisma, actor, caseId);
  const hearings = await prisma.hearing.findMany({
    where: { caseId },
    orderBy: { scheduledDate: "asc" },
  });
  return hearings.map(toHearingDto);
}

export async function createHearing(
  actor: ActorContext,
  caseId: string,
  input: HearingCreateInput,
  request: AuditRequestContext,
): Promise<HearingDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);
  validateScheduledDate(input.scheduledDate, caseRow.custodyStartDate);

  const hearing = await prisma.$transaction(async (tx) => {
    const h = await tx.hearing.create({
      data: {
        caseId,
        scheduledDate: new Date(input.scheduledDate),
        hearingType: input.hearingType,
        purpose: input.purpose,
        outcome: input.outcome,
        wasProduced: input.wasProduced,
        adjournmentReason: input.adjournmentReason,
        orderSummary: input.orderSummary,
        nextHearingDate: input.nextHearingDate ? new Date(input.nextHearingDate) : null,
        recordedById: actor.id,
      },
    });
    await recomputeCaseHearingDates(tx, caseId);
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "Hearing",
      entityId: h.id,
      entityLabel: `${h.hearingType} hearing for ${caseRow.caseRef}`,
      summary: `${actor.email} recorded a ${h.hearingType} hearing for case ${caseRow.caseRef}`,
      after: h,
    });
    return h;
  });

  return toHearingDto(hearing);
}

export async function updateHearing(
  actor: ActorContext,
  hearingId: string,
  input: HearingUpdateInput,
  request: AuditRequestContext,
): Promise<HearingDto> {
  const existing = await prisma.hearing.findUnique({ where: { id: hearingId } });
  if (!existing) throw new AppError("NOT_FOUND", "Hearing not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  if (input.scheduledDate) {
    validateScheduledDate(input.scheduledDate, caseRow.custodyStartDate);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const h = await tx.hearing.update({
      where: { id: hearingId },
      data: {
        ...input,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
        nextHearingDate: input.nextHearingDate ? new Date(input.nextHearingDate) : undefined,
      },
    });
    await recomputeCaseHearingDates(tx, existing.caseId);
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "UPDATE",
      entityType: "Hearing",
      entityId: h.id,
      entityLabel: `${h.hearingType} hearing for ${caseRow.caseRef}`,
      summary: `${actor.email} updated a hearing on case ${caseRow.caseRef}`,
      before: existing,
      after: h,
    });
    return h;
  });

  return toHearingDto(updated);
}

export async function markOrderReviewed(
  actor: ActorContext,
  hearingId: string,
  input: HearingMarkOrderReviewedInput,
  request: AuditRequestContext,
): Promise<HearingDto> {
  const existing = await prisma.hearing.findUnique({ where: { id: hearingId } });
  if (!existing) throw new AppError("NOT_FOUND", "Hearing not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  const updated = await prisma.$transaction(async (tx) => {
    const h = await tx.hearing.update({
      where: { id: hearingId },
      data: {
        orderReviewed: true,
        orderReviewedAt: new Date(),
        orderReviewedById: actor.id,
        orderSummary: input.orderSummary ?? existing.orderSummary,
      },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "UPDATE",
      entityType: "Hearing",
      entityId: h.id,
      entityLabel: `${h.hearingType} hearing for ${caseRow.caseRef}`,
      summary: `${actor.email} marked the order for a hearing on case ${caseRow.caseRef} as reviewed`,
      before: { orderReviewed: existing.orderReviewed },
      after: { orderReviewed: true },
    });
    return h;
  });

  return toHearingDto(updated);
}

export async function listUpcomingHearings(
  actor: ActorContext,
  days: number,
): Promise<UpcomingHearingItemDto[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const hearings = await prisma.hearing.findMany({
    where: {
      scheduledDate: { gte: now, lte: until },
      outcome: { not: "CANCELLED" },
      case: hasUnscopedCaseVisibility(actor.role) ? undefined : { assignedToId: actor.id },
    },
    include: { case: { select: { caseRef: true, assignedToId: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  return hearings.map((h) => ({
    ...toHearingDto(h),
    caseRef: h.case.caseRef,
    assignedToId: h.case.assignedToId,
  }));
}
