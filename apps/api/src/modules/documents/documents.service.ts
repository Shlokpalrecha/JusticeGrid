import type { DocumentRequirement } from "@prisma/client";
import {
  AppError,
  type DocumentCreateInput,
  type DocumentRequirementDto,
  type DocumentUpdateInput,
  type DocumentVerifyInput,
} from "@justicegrid/shared";
import type { AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { loadAccessibleCase } from "../../lib/caseAccess.js";
import { touchCaseActivity } from "../../lib/caseActivity.js";
import { createNotification, shouldNotify } from "../../lib/notifications.js";
import { evaluateAndPersistCase } from "../../lib/priorityEvaluation.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
  email: string;
  role: "ADMIN" | "LEGAL_PROFESSIONAL" | "AUDITOR";
}

/**
 * Default mandatory-document checklist applied by `apply-checklist`
 * (spec §7). These are demonstration defaults for the prototype — a
 * reasonable baseline checklist, not an authoritative legal requirement
 * list (spec §1.9's "demonstration rules" framing applies here too, even
 * though this isn't a scoring Rule row). FIR/charge-sheet/remand/
 * identity/vakalatnama/custody-certificate are treated as always
 * mandatory; bail- and evidence-related documents are seeded as
 * optional, since they only become relevant depending on how the case
 * proceeds (bail applied, medical need, etc.) — a reviewer marks them
 * mandatory manually via `POST /cases/:id/documents` if the case needs
 * them.
 */
const DEFAULT_MANDATORY_DOCUMENT_TYPES = [
  "FIR_COPY",
  "CHARGE_SHEET",
  "REMAND_ORDER",
  "IDENTITY_PROOF",
  "VAKALATNAMA",
  "CUSTODY_CERTIFICATE",
] as const;

const DEFAULT_OPTIONAL_DOCUMENT_TYPES = [
  "BAIL_APPLICATION",
  "BAIL_ORDER",
  "SURETY_DOCUMENTS",
  "MEDICAL_REPORT",
  "WITNESS_LIST",
  "PREVIOUS_ORDERS",
] as const;

export function toDocumentDto(d: DocumentRequirement): DocumentRequirementDto {
  return {
    id: d.id,
    caseId: d.caseId,
    documentType: d.documentType,
    isMandatory: d.isMandatory,
    status: d.status,
    requestedAt: d.requestedAt?.toISOString() ?? null,
    receivedAt: d.receivedAt?.toISOString() ?? null,
    verifiedAt: d.verifiedAt?.toISOString() ?? null,
    verifiedById: d.verifiedById,
    sourceNote: d.sourceNote,
    remarks: d.remarks,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function listDocuments(
  actor: ActorContext,
  caseId: string,
): Promise<DocumentRequirementDto[]> {
  await loadAccessibleCase(prisma, actor, caseId);
  const docs = await prisma.documentRequirement.findMany({
    where: { caseId },
    orderBy: { documentType: "asc" },
  });
  return docs.map(toDocumentDto);
}

export async function addDocument(
  actor: ActorContext,
  caseId: string,
  input: DocumentCreateInput,
  request: AuditRequestContext,
): Promise<DocumentRequirementDto> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const existing = await prisma.documentRequirement.findFirst({
    where: { caseId, documentType: input.documentType },
  });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      `A ${input.documentType} requirement already exists for this case.`,
    );
  }

  const doc = await prisma.$transaction(async (tx) => {
    const d = await tx.documentRequirement.create({
      data: {
        caseId,
        documentType: input.documentType,
        isMandatory: input.isMandatory,
        sourceNote: input.sourceNote,
        remarks: input.remarks,
      },
    });
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "DocumentRequirement",
      entityId: d.id,
      entityLabel: `${d.documentType} on ${caseRow.caseRef}`,
      summary: `${actor.email} added a ${d.documentType} requirement to case ${caseRow.caseRef}`,
      after: d,
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
    return d;
  });

  return toDocumentDto(doc);
}

export async function updateDocument(
  actor: ActorContext,
  documentId: string,
  input: DocumentUpdateInput,
  request: AuditRequestContext,
): Promise<DocumentRequirementDto> {
  const existing = await prisma.documentRequirement.findUnique({ where: { id: documentId } });
  if (!existing) throw new AppError("NOT_FOUND", "Document requirement not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.documentRequirement.update({
      where: { id: documentId },
      data: {
        status: input.status,
        sourceNote: input.sourceNote,
        remarks: input.remarks,
        requestedAt: input.status === "REQUESTED" && !existing.requestedAt ? now : undefined,
        receivedAt: input.status === "RECEIVED" && !existing.receivedAt ? now : undefined,
      },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "UPDATE",
      entityType: "DocumentRequirement",
      entityId: d.id,
      entityLabel: `${d.documentType} on ${caseRow.caseRef}`,
      summary: `${actor.email} updated the ${d.documentType} requirement on case ${caseRow.caseRef}`,
      before: existing,
      after: d,
    });
    await evaluateAndPersistCase(tx, existing.caseId, {
      triggeredBy: "USER",
      triggeredById: actor.id,
    });
    if (
      input.status === "REQUESTED" &&
      existing.status !== "REQUESTED" &&
      caseRow.assignedToId &&
      shouldNotify(caseRow.assignedToId, actor.id)
    ) {
      await createNotification(tx, {
        userId: caseRow.assignedToId,
        type: "DOCUMENT_REQUESTED",
        title: "Document requested",
        body: `${actor.email} requested the ${d.documentType} document on case ${caseRow.caseRef}.`,
        relatedEntityType: "DocumentRequirement",
        relatedEntityId: d.id,
      });
    }
    return d;
  });

  return toDocumentDto(updated);
}

export async function verifyDocument(
  actor: ActorContext,
  documentId: string,
  input: DocumentVerifyInput,
  request: AuditRequestContext,
): Promise<DocumentRequirementDto> {
  const existing = await prisma.documentRequirement.findUnique({ where: { id: documentId } });
  if (!existing) throw new AppError("NOT_FOUND", "Document requirement not found.");
  const caseRow = await loadAccessibleCase(prisma, actor, existing.caseId);

  if (existing.status !== "RECEIVED") {
    throw new AppError("VALIDATION_ERROR", "Only a RECEIVED document can be verified.", [
      { field: "status", issue: `Current status is ${existing.status}` },
    ]);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.documentRequirement.update({
      where: { id: documentId },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifiedById: actor.id,
        remarks: input.remarks ?? existing.remarks,
      },
    });
    await touchCaseActivity(tx, existing.caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "UPDATE",
      entityType: "DocumentRequirement",
      entityId: d.id,
      entityLabel: `${d.documentType} on ${caseRow.caseRef}`,
      summary: `${actor.email} verified the ${d.documentType} document on case ${caseRow.caseRef}`,
      before: { status: existing.status },
      after: { status: "VERIFIED" },
    });
    await evaluateAndPersistCase(tx, existing.caseId, {
      triggeredBy: "USER",
      triggeredById: actor.id,
    });
    return d;
  });

  return toDocumentDto(updated);
}

/** `POST /cases/:id/documents/apply-checklist` (spec §7): seeds the
 * default mandatory checklist, skipping any documentType already present
 * for this case — idempotent, safe to call more than once. */
export async function applyChecklist(
  actor: ActorContext,
  caseId: string,
  request: AuditRequestContext,
): Promise<DocumentRequirementDto[]> {
  const caseRow = await loadAccessibleCase(prisma, actor, caseId);

  const existingTypes = new Set(
    (
      await prisma.documentRequirement.findMany({
        where: { caseId },
        select: { documentType: true },
      })
    ).map((d) => d.documentType),
  );

  const toCreate = [
    ...DEFAULT_MANDATORY_DOCUMENT_TYPES.filter((t) => !existingTypes.has(t)).map(
      (documentType) => ({
        documentType,
        isMandatory: true,
      }),
    ),
    ...DEFAULT_OPTIONAL_DOCUMENT_TYPES.filter((t) => !existingTypes.has(t)).map((documentType) => ({
      documentType,
      isMandatory: false,
    })),
  ];

  if (toCreate.length === 0) {
    const current = await prisma.documentRequirement.findMany({ where: { caseId } });
    return current.map(toDocumentDto);
  }

  await prisma.$transaction(async (tx) => {
    const rows: DocumentRequirement[] = [];
    for (const item of toCreate) {
      rows.push(await tx.documentRequirement.create({ data: { caseId, ...item } }));
    }
    await touchCaseActivity(tx, caseId);
    await writeAuditEntry(tx, actor, request, {
      action: "CREATE",
      entityType: "DocumentRequirement",
      entityLabel: `Checklist for ${caseRow.caseRef}`,
      summary: `${actor.email} applied the default document checklist (${rows.length} item(s)) to case ${caseRow.caseRef}`,
      after: { documentTypes: rows.map((r) => r.documentType) },
    });
    await evaluateAndPersistCase(tx, caseId, { triggeredBy: "USER", triggeredById: actor.id });
  });

  // Re-fetched rather than reusing the rows created above, so the
  // response always includes the full checklist (pre-existing +
  // newly-created), not just what this call added.
  const all = await prisma.documentRequirement.findMany({ where: { caseId } });
  return all.map(toDocumentDto);
}
