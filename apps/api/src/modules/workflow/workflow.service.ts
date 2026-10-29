import { lockCaseWorkflow, invalidateLegalReviews } from "../../lib/workflowLinks.js";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  WorkflowUpdateSchema,
  ActionCreateSchema,
  ActionTransitionSchema,
  ActionOverrideSchema,
  ActionAssignSchema,
} from "@justicegrid/shared";
import { AppError, WorkflowFactsSchema, validateWorkflowChronology } from "@justicegrid/shared";
import { canonicalJson, type ActionInput } from "@justicegrid/rules-engine";
import { type AuditRequestContext, writeAuditEntry } from "../../lib/audit.js";
import { loadAccessibleCase } from "../../lib/caseAccess.js";
import { evaluateAndPersistCase, toJson } from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";
import type { QueueActor } from "../priority/priority.service.js";
import type { Prisma } from "@prisma/client";
async function validateActionOwner(
  tx: Prisma.TransactionClient,
  ownerId: string | null,
  caseOwnerId: string | null,
) {
  if (!ownerId) return;
  const owner = await tx.user.findFirst({
    where: { id: ownerId, isActive: true, deletedAt: null, role: { not: "AUDITOR" } },
  });
  if (!owner || (owner.role !== "ADMIN" && owner.id !== caseOwnerId))
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose the assigned legal professional or an active coordinator so the owner can access this case.",
    );
}
export async function getWorkflow(actor: QueueActor, caseId: string) {
  const c = await loadAccessibleCase(prisma, actor, caseId);
  const rows = await prisma.workflowAction.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
  return {
    caseOwnerId: c.assignedToId,
    facts: WorkflowFactsSchema.parse(c.workflowFacts),
    revision: c.workflowRevision,
    error: c.queueError,
    actions: rows.map((r) => ({
      ...(r.payload as object),
      id: r.id,
      key: r.key,
      status: r.status,
      revision: r.revision,
      generated: r.generated,
    })),
  };
}
export async function updateWorkflow(
  actor: QueueActor,
  caseId: string,
  body: z.infer<typeof WorkflowUpdateSchema>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId),
        now = new Date();
      if (c.workflowRevision !== body.expectedRevision)
        throw new AppError("CONFLICT", "Case workflow changed. Reload before saving.");
      const errors = validateWorkflowChronology(body.facts, now);
      if (errors.length) throw new AppError("VALIDATION_ERROR", errors.join("; "));
      const old = WorkflowFactsSchema.parse(c.workflowFacts);
      const basisKeys = [
        "procedure",
        "procedureBasis",
        "specialLaw",
        "arrestAt",
        "firstRemandAt",
        "custodyIntervals",
        "excludedIntervals",
        "priorConvictions",
        "otherPendingCases",
        "multipleOffences",
        "currentChargesVerifiedAt",
        "punishmentBasis",
        "firstEvidenceDate",
        "custodyThroughoutEvidence",
        "recordedCourtException",
      ] as const;
      const basisChanged = basisKeys.some(
        (k) => canonicalJson(old[k]) !== canonicalJson(body.facts[k]),
      );
      for (const review of body.facts.confirmedReviews) {
        const previous = old.confirmedReviews.find((r) => r.id === review.id);
        const confirmationKeys = [
          "dueAt",
          "precision",
          "origin",
          "sourceId",
          "locator",
          "basis",
          "profileId",
          "assumptions",
          "countingConvention",
          "anchorAt",
          "forthwith",
        ] as const;
        if (
          previous &&
          previous.confirmedAt === review.confirmedAt &&
          confirmationKeys.some((k) => canonicalJson(previous[k]) !== canonicalJson(review[k]))
        )
          throw new AppError(
            "VALIDATION_ERROR",
            "Changing a confirmed date or its basis requires a fresh confirmation timestamp.",
          );
        if (basisChanged && previous && previous.confirmedAt === review.confirmedAt)
          review.invalidatedReason =
            "Relevant legal/custody facts changed; reconfirm this review date.";
        else if (previous?.invalidatedReason && previous.confirmedAt === review.confirmedAt)
          review.invalidatedReason = previous.invalidatedReason;
        else if (!previous || previous.confirmedAt !== review.confirmedAt) {
          delete review.invalidatedReason;
          review.confirmedBy = actor.id;
        }
      }
      if (basisChanged)
        await invalidateLegalReviews(
          tx,
          caseId,
          "Relevant legal/custody facts changed; reconfirm dependent dates.",
          false,
        );
      for (const hearingId of body.facts.attendanceUnconfirmedHearingIds)
        if (!(await tx.hearing.findFirst({ where: { id: hearingId, caseId } })))
          throw new AppError(
            "VALIDATION_ERROR",
            "Attendance follow-up must reference this case's hearing.",
          );
      for (const r of old.urgentReports.filter((r) => !r.resolvedAt))
        if (!body.facts.urgentReports.some((x) => x.id === r.id))
          throw new AppError(
            "VALIDATION_ERROR",
            "Resolve an active referral with evidence; do not delete it.",
          );
      for (const r of old.confirmedReviews.filter((r) => !r.completedAt))
        if (!body.facts.confirmedReviews.some((x) => x.id === r.id))
          throw new AppError(
            "VALIDATION_ERROR",
            "Record completion/correction of a confirmed review; do not delete it.",
          );
      for (const r of body.facts.confirmedReviews) {
        const profile = await tx.legalProfile.findUnique({ where: { id: r.profileId } });
        if (
          !profile ||
          profile.sourceId !== r.sourceId ||
          profile.verifiedAt > new Date(r.confirmedAt) ||
          profile.effectiveFrom > new Date(r.confirmedAt)
        )
          throw new AppError(
            "VALIDATION_ERROR",
            "Confirmed review needs a matching source profile verified before confirmation.",
          );
        if (
          !r.invalidatedReason &&
          ![body.facts.procedure, "NATIONAL_PROCEDURE"].includes(profile.procedure)
        )
          throw new AppError(
            "VALIDATION_ERROR",
            "Confirm the applicable procedure before recording a protected legal date.",
          );
        if (
          !r.invalidatedReason &&
          !["india", "india-wide", "india wide"].includes(profile.territory.toLowerCase())
        )
          throw new AppError(
            "VALIDATION_ERROR",
            "This queue uses the India-wide baseline; a local profile needs a separate applicability review.",
          );
        const before = old.confirmedReviews.find((x) => x.id === r.id);
        if (
          !before ||
          before.confirmedAt !== r.confirmedAt ||
          canonicalJson(before) !== canonicalJson(r)
        )
          r.confirmedBy = actor.id;
      }
      if (
        body.facts.legalProfileId &&
        !(await tx.legalProfile.findUnique({ where: { id: body.facts.legalProfileId } }))
      )
        throw new AppError("VALIDATION_ERROR", "Unknown applicability profile.");
      await tx.case.update({
        where: { id: caseId },
        data: { workflowFacts: toJson(body.facts), workflowRevision: { increment: 1 } },
      });
      await evaluateAndPersistCase(tx, caseId, {
        triggeredBy: "USER",
        triggeredById: actor.id,
        now,
      });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `Workflow evidence: ${body.changeReason}`,
        before: old,
        after: body.facts,
      });
      return { revision: c.workflowRevision + 1 };
    },
    { timeout: 30_000 },
  );
}
export async function createAction(
  actor: QueueActor,
  caseId: string,
  body: z.infer<typeof ActionCreateSchema>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId),
        now = new Date();
      if (new Date(body.activatedAt) > now || (body.anchorAt && new Date(body.anchorAt) > now))
        throw new AppError(
          "VALIDATION_ERROR",
          "Completed anchor/activation events cannot be future dates.",
        );
      if (body.anchorAt && body.dueAt && new Date(body.dueAt) < new Date(body.anchorAt))
        throw new AppError("VALIDATION_ERROR", "Action due date cannot precede its event anchor.");
      if (
        body.hearingId &&
        !(await tx.hearing.findFirst({ where: { id: body.hearingId, caseId } }))
      )
        throw new AppError("VALIDATION_ERROR", "Hearing must belong to this case.");
      if (
        body.parentKey &&
        !(await tx.workflowAction.findFirst({
          where: {
            caseId,
            key: body.parentKey,
            status: { in: ["OPEN", "ACKNOWLEDGED", "BLOCKED"] },
          },
        }))
      )
        throw new AppError("VALIDATION_ERROR", "Parent action must exist in the same case.");
      await validateActionOwner(tx, body.ownerId, c.assignedToId);
      if (body.profileId) {
        const p = await tx.legalProfile.findUnique({ where: { id: body.profileId } });
        if (!p || p.sourceId !== body.sourceId || p.verifiedAt > now || p.effectiveFrom > now)
          throw new AppError("VALIDATION_ERROR", "Choose a matching reviewed source profile.");
        if (
          body.critical &&
          (![WorkflowFactsSchema.parse(c.workflowFacts).procedure, "NATIONAL_PROCEDURE"].includes(
            p.procedure,
          ) ||
            !["india", "india-wide", "india wide"].includes(p.territory.toLowerCase()))
        )
          throw new AppError(
            "VALIDATION_ERROR",
            "The protected date needs a profile matching this case's confirmed procedure and national baseline.",
          );
      }
      const key = `${body.type}:${encodeURIComponent(body.anchorReference)}:${encodeURIComponent(body.occurrenceId)}`;
      if (await tx.workflowAction.findUnique({ where: { caseId_key: { caseId, key } } }))
        throw new AppError(
          "CONFLICT",
          "This action occurrence already exists; update its status instead of duplicating it.",
        );
      const id = randomUUID();
      const action: ActionInput = {
        ...body,
        id,
        key,
        status: "OPEN",
        acknowledgedAt: null,
        resolvedAt: null,
        resolutionEvidence: null,
        override: null,
        ...(body.precision === "DATE_ONLY"
          ? {
              critical: false,
              origin: "TEAM_TARGET" as const,
              criticalDataMissing: true,
              evidence:
                body.evidence +
                "; date-only legal date: confirm actual cutoff. Displayed time is a team review target.",
            }
          : {}),
      };
      await tx.workflowAction.create({
        data: { id, caseId, key, type: body.type, payload: toJson(action), generated: false },
      });
      await evaluateAndPersistCase(tx, caseId, {
        triggeredBy: "USER",
        triggeredById: actor.id,
        now,
      });
      await writeAuditEntry(tx, actor, request, {
        action: "CREATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `Recorded action: ${body.title}`,
        after: action,
      });
      return { id };
    },
    { timeout: 30_000 },
  );
}
export async function transitionAction(
  actor: QueueActor,
  caseId: string,
  id: string,
  body: z.infer<typeof ActionTransitionSchema>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId);
      const row = await tx.workflowAction.findFirst({ where: { id, caseId } });
      if (!row) throw new AppError("NOT_FOUND", "Action not found.");
      if (row.revision !== body.expectedRevision)
        throw new AppError("CONFLICT", "Action changed; reload it.");
      if (
        ["RESOLVED", "CANCELLED"].includes(body.status) &&
        (await tx.workflowAction.count({
          where: {
            caseId,
            status: { in: ["OPEN", "ACKNOWLEDGED", "BLOCKED"] },
            payload: { path: ["parentKey"], equals: row.key },
          },
        }))
      )
        throw new AppError(
          "VALIDATION_ERROR",
          "Resolve or transfer open dependency actions first.",
        );
      if (
        row.generated &&
        (row.type !== "A11" ||
          !String((row.payload as { sourceKey?: string }).sourceKey ?? row.key).startsWith(
            "production:",
          )) &&
        ["RESOLVED", "CANCELLED"].includes(body.status)
      )
        throw new AppError(
          "VALIDATION_ERROR",
          "Update the source task, document or workflow outcome to resolve this generated action.",
        );
      if (["RESOLVED", "CANCELLED"].includes(row.status))
        throw new AppError(
          "VALIDATION_ERROR",
          "Create a new action occurrence when work recurs; history remains closed.",
        );
      const now = new Date(),
        old = row.payload as unknown as ActionInput;
      if (body.status === "ACKNOWLEDGED" && old.type === "A01" && !body.nextReviewAt)
        throw new AppError(
          "VALIDATION_ERROR",
          "An acknowledged urgent referral needs a next review time.",
        );
      if (body.nextReviewAt && new Date(body.nextReviewAt) <= now)
        throw new AppError("VALIDATION_ERROR", "Next review must be a future time.");
      const action = {
        ...old,
        status: body.status,
        acknowledgedAt:
          body.status === "ACKNOWLEDGED"
            ? now.toISOString()
            : body.status === "OPEN"
              ? null
              : old.acknowledgedAt,
        resolvedAt: ["RESOLVED", "CANCELLED"].includes(body.status) ? now.toISOString() : null,
        resolutionEvidence: body.evidence,
        ...(body.nextReviewAt ? { nextReviewAt: body.nextReviewAt } : {}),
      };
      if (row.generated && old.type === "A01") {
        const facts = WorkflowFactsSchema.parse(c.workflowFacts);
        const sourceId = (old.sourceKey ?? old.key).slice("referral:".length);
        const report = facts.urgentReports.find((r) => r.id === sourceId);
        if (!report) throw new AppError("CONFLICT", "Referral source changed. Reload the case.");
        report.acknowledgedAt = action.acknowledgedAt;
        report.nextReviewAt = body.status === "OPEN" ? null : (action.nextReviewAt ?? null);
        await tx.case.update({
          where: { id: caseId },
          data: { workflowFacts: toJson(facts), workflowRevision: { increment: 1 } },
        });
      }
      await tx.workflowAction.update({
        where: { id },
        data: { status: body.status, payload: toJson(action), revision: { increment: 1 } },
      });
      await evaluateAndPersistCase(tx, caseId, {
        triggeredBy: "USER",
        triggeredById: actor.id,
        now,
      });
      await writeAuditEntry(tx, actor, request, {
        action: "STATUS_CHANGE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `${old.title}: ${body.status}`,
        before: old,
        after: action,
      });
      return { revision: row.revision + 1 };
    },
    { timeout: 30_000 },
  );
}
export async function overrideAction(
  actor: QueueActor,
  caseId: string,
  id: string,
  body: z.infer<typeof ActionOverrideSchema>,
  request: AuditRequestContext,
) {
  if (actor.role !== "ADMIN")
    throw new AppError("FORBIDDEN", "A coordinator must review ordering overrides.");
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId),
        row = await tx.workflowAction.findFirst({ where: { id, caseId } });
      if (!row) throw new AppError("NOT_FOUND", "Action not found.");
      if (row.revision !== body.expectedRevision)
        throw new AppError("CONFLICT", "Action changed; reload it.");
      if (["RESOLVED", "CANCELLED"].includes(row.status))
        throw new AppError("VALIDATION_ERROR", "Closed action history cannot be overridden.");
      const now = new Date();
      if (
        new Date(body.expiresAt) <= now ||
        new Date(body.expiresAt).getTime() > now.getTime() + 7 * 86400000
      )
        throw new AppError("VALIDATION_ERROR", "Override must expire within seven days.");
      const old = row.payload as unknown as ActionInput;
      if (body.urgency === "U0" && !old.critical && !(old.type === "A01" && !old.acknowledgedAt))
        throw new AppError(
          "VALIDATION_ERROR",
          "Routine work cannot be promoted into protected immediate urgency.",
        );
      if ((old.critical || (old.type === "A01" && !old.acknowledgedAt)) && body.urgency !== "U0")
        throw new AppError("VALIDATION_ERROR", "An override cannot hide protected critical work.");
      const action = {
        ...old,
        override: {
          urgency: body.urgency,
          reason: body.reason,
          expiresAt: body.expiresAt,
          reviewerId: actor.id,
        },
      };
      await tx.workflowAction.update({
        where: { id },
        data: { payload: toJson(action), revision: { increment: 1 } },
      });
      await evaluateAndPersistCase(tx, caseId, {
        triggeredBy: "USER",
        triggeredById: actor.id,
        now,
      });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `Ordering override: ${body.reason}`,
        before: old,
        after: action,
      });
      return { revision: row.revision + 1 };
    },
    { timeout: 30_000 },
  );
}

export async function assignAction(
  actor: QueueActor,
  caseId: string,
  id: string,
  body: z.infer<typeof ActionAssignSchema>,
  request: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockCaseWorkflow(tx, caseId);
      const c = await loadAccessibleCase(tx, actor, caseId);
      const row = await tx.workflowAction.findFirst({ where: { id, caseId } });
      if (!row) throw new AppError("NOT_FOUND", "Action not found.");
      if (row.revision !== body.expectedRevision)
        throw new AppError("CONFLICT", "Action changed; reload it.");
      if (["RESOLVED", "CANCELLED"].includes(row.status))
        throw new AppError("VALIDATION_ERROR", "Closed action history cannot be reassigned.");
      await validateActionOwner(tx, body.ownerId, c.assignedToId);
      const old = row.payload as unknown as ActionInput;
      const action = { ...old, ownerId: body.ownerId, ownerOverride: body.ownerId };
      await tx.workflowAction.update({
        where: { id },
        data: { payload: toJson(action), revision: { increment: 1 } },
      });
      await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
      await writeAuditEntry(tx, actor, request, {
        action: "UPDATE",
        entityType: "Case",
        entityId: caseId,
        entityLabel: c.caseRef,
        summary: `Action ownership: ${body.reason}`,
        before: old,
        after: action,
      });
      return { revision: row.revision + 1 };
    },
    { timeout: 30_000 },
  );
}
