import type { PrismaClient } from "@prisma/client";

/**
 * The 6 mandatory fixture cases (spec §10) — hand-crafted, not generated,
 * so their setups are exact and repeatable for the viva demo and golden
 * snapshot tests. Each one is built to structurally trigger the rules
 * spec §10's table names; the exact resulting score depends on the live
 * ruleset (packages/lib/defaultRuleset.ts) at seed time, not hard-coded
 * here, so it stays correct if that table is ever retuned.
 */
export async function seedFixtureCases(
  prisma: PrismaClient,
  ctx: { adminId: string; lawyerId: string; now: Date },
): Promise<string[]> {
  const { adminId, lawyerId, now } = ctx;
  const day = 86_400_000;
  const caseIds: string[] = [];

  async function person(aliasCode: string, displayName: string) {
    return prisma.person.upsert({
      where: { aliasCode },
      update: {},
      create: {
        aliasCode,
        displayName,
        ageBand: "26-35",
        gender: "M",
        isSynthetic: true,
      },
    });
  }

  // JG-2026-0001 "Case A" — hearing in 2 days, incomplete prep task,
  // overdue follow-up task, mandatory FIR copy missing → HIGH.
  {
    const p = await person("UT-0001", "Fictional Person A");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0001",
        personId: p.id,
        courtName: "District & Sessions Court, Central",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-Alpha",
        firNumberSynthetic: "FIR-SYN-0001",
        firYear: 2026,
        caseStatus: "TRIAL_ONGOING",
        custodyType: "JUDICIAL",
        custodyStartDate: new Date(now.getTime() - 45 * day),
        bailStatus: "NOT_APPLIED",
        assignedToId: lawyerId,
        assignedAt: now,
        assignedById: adminId,
        createdById: adminId,
        lastActivityAt: now,
        nextHearingDate: new Date(now.getTime() + 2 * day),
      },
    });
    await prisma.charge.create({
      data: {
        caseId: c.id,
        actName: "IPC",
        sectionCode: "392",
        description: "Robbery",
        isBailableFlag: false,
        severityBand: "SEVERE",
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: c.id,
        scheduledDate: new Date(now.getTime() + 2 * day),
        hearingType: "ARGUMENTS",
        outcome: "PENDING",
        recordedById: adminId,
      },
    });
    await prisma.task.create({
      data: {
        caseId: c.id,
        title: "Prepare witness examination notes",
        category: "EVIDENCE_COLLECTION",
        assignedToId: lawyerId,
        createdById: adminId,
        dueDate: new Date(now.getTime() + 2 * day),
        status: "PENDING",
        isPreparationTask: true,
      },
    });
    await prisma.task.create({
      data: {
        caseId: c.id,
        title: "Follow up on bail surety documents",
        category: "FOLLOW_UP",
        assignedToId: lawyerId,
        createdById: adminId,
        dueDate: new Date(now.getTime() - 4 * day),
        status: "PENDING",
      },
    });
    await prisma.documentRequirement.create({
      data: { caseId: c.id, documentType: "FIR_COPY", isMandatory: true, status: "MISSING" },
    });
    caseIds.push(c.id);
  }

  // JG-2026-0002 "Case B" — hearing 25 days away, all documents
  // verified, no pending tasks → ROUTINE.
  {
    const p = await person("UT-0002", "Fictional Person B");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0002",
        personId: p.id,
        courtName: "District & Sessions Court, South",
        courtType: "District Court",
        district: "South",
        state: "Delhi",
        policeStationAlias: "PS-Bravo",
        firNumberSynthetic: "FIR-SYN-0002",
        firYear: 2026,
        caseStatus: "TRIAL_ONGOING",
        custodyType: "JUDICIAL",
        custodyStartDate: new Date(now.getTime() - 60 * day),
        bailStatus: "GRANTED",
        assignedToId: lawyerId,
        assignedAt: now,
        assignedById: adminId,
        createdById: adminId,
        lastActivityAt: now,
        nextHearingDate: new Date(now.getTime() + 25 * day),
      },
    });
    await prisma.charge.create({
      data: {
        caseId: c.id,
        actName: "IPC",
        sectionCode: "379",
        description: "Theft",
        isBailableFlag: true,
        severityBand: "MODERATE",
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: c.id,
        scheduledDate: new Date(now.getTime() + 25 * day),
        hearingType: "ARGUMENTS",
        outcome: "PENDING",
        recordedById: adminId,
      },
    });
    for (const documentType of [
      "FIR_COPY",
      "CHARGE_SHEET",
      "IDENTITY_PROOF",
      "VAKALATNAMA",
    ] as const) {
      await prisma.documentRequirement.create({
        data: {
          caseId: c.id,
          documentType,
          isMandatory: true,
          status: "VERIFIED",
          verifiedById: adminId,
          verifiedAt: now,
        },
      });
    }
    caseIds.push(c.id);
  }

  // JG-2026-0003 — unassigned, no next hearing date, incomplete case
  // fields → R-NO-ASSIGNEE, R-NO-HEARING-DATE, R-CASE-INCOMPLETE.
  {
    const p = await person("UT-0003", "Fictional Person C");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0003",
        personId: p.id,
        courtName: "Metropolitan Magistrate Court",
        courtType: "Magistrate Court",
        district: "East",
        state: "Delhi",
        policeStationAlias: "PS-Charlie",
        firNumberSynthetic: "FIR-SYN-0003",
        firYear: 2026,
        caseStatus: "REGISTERED",
        custodyType: "JUDICIAL",
        custodyStartDate: null,
        bailStatus: "NOT_APPLIED",
        assignedToId: null,
        createdById: adminId,
        lastActivityAt: now,
        nextHearingDate: null,
      },
    });
    caseIds.push(c.id);
  }

  // JG-2026-0004 — hearing held 14 days ago, order not reviewed →
  // R-ORDER-UNREVIEWED.
  {
    const p = await person("UT-0004", "Fictional Person D");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0004",
        personId: p.id,
        courtName: "District & Sessions Court, North",
        courtType: "District Court",
        district: "North",
        state: "Delhi",
        policeStationAlias: "PS-Delta",
        firNumberSynthetic: "FIR-SYN-0004",
        firYear: 2026,
        caseStatus: "TRIAL_ONGOING",
        custodyType: "JUDICIAL",
        custodyStartDate: new Date(now.getTime() - 90 * day),
        bailStatus: "NOT_APPLIED",
        assignedToId: lawyerId,
        assignedAt: now,
        assignedById: adminId,
        createdById: adminId,
        lastActivityAt: now,
        lastHearingDate: new Date(now.getTime() - 14 * day),
        nextHearingDate: new Date(now.getTime() + 30 * day),
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: c.id,
        scheduledDate: new Date(now.getTime() - 14 * day),
        hearingType: "ARGUMENTS",
        outcome: "ORDER_PASSED",
        orderReviewed: false,
        orderSummary: "Order passed; pending review.",
        recordedById: adminId,
      },
    });
    caseIds.push(c.id);
  }

  // JG-2026-0005 — 3 consecutive adjournments, bail filed 40 days ago,
  // no outcome → R-ADJOURN-3X, R-BAIL-STALLED.
  {
    const p = await person("UT-0005", "Fictional Person E");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0005",
        personId: p.id,
        courtName: "District & Sessions Court, West",
        courtType: "District Court",
        district: "West",
        state: "Delhi",
        policeStationAlias: "PS-Echo",
        firNumberSynthetic: "FIR-SYN-0005",
        firYear: 2026,
        caseStatus: "TRIAL_ONGOING",
        custodyType: "JUDICIAL",
        custodyStartDate: new Date(now.getTime() - 120 * day),
        bailStatus: "APPLICATION_FILED",
        bailAppliedDate: new Date(now.getTime() - 40 * day),
        assignedToId: lawyerId,
        assignedAt: now,
        assignedById: adminId,
        createdById: adminId,
        lastActivityAt: now,
        nextHearingDate: new Date(now.getTime() + 10 * day),
      },
    });
    for (let i = 3; i >= 1; i--) {
      await prisma.hearing.create({
        data: {
          caseId: c.id,
          scheduledDate: new Date(now.getTime() - i * 20 * day),
          hearingType: "BAIL_HEARING",
          outcome: "ADJOURNED",
          adjournmentReason: "Counsel unavailable",
          recordedById: adminId,
        },
      });
    }
    caseIds.push(c.id);
  }

  // JG-2026-0006 — every rule triggered → maximum score (the cap test).
  {
    const p = await person("UT-0006", "Fictional Person F");
    const c = await prisma.case.create({
      data: {
        caseRef: "JG-2026-0006",
        personId: p.id,
        courtName: "",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-Foxtrot",
        firNumberSynthetic: "FIR-SYN-0006",
        firYear: 2026,
        caseStatus: "TRIAL_ONGOING",
        custodyType: "JUDICIAL",
        custodyStartDate: new Date(now.getTime() - 400 * day),
        bailStatus: "APPLICATION_FILED",
        bailAppliedDate: new Date(now.getTime() - 60 * day),
        assignedToId: null,
        createdById: adminId,
        lastActivityAt: new Date(now.getTime() - 60 * day),
        nextHearingDate: new Date(now.getTime() + 1 * day),
      },
    });
    // Deliberately no charges (feeds R-CASE-INCOMPLETE too).
    for (let i = 3; i >= 1; i--) {
      await prisma.hearing.create({
        data: {
          caseId: c.id,
          scheduledDate: new Date(now.getTime() - i * 15 * day),
          hearingType: "ARGUMENTS",
          outcome: i === 1 ? "ORDER_PASSED" : "ADJOURNED",
          orderReviewed: false,
          orderSummary: i === 1 ? "Order passed; pending review." : null,
          recordedById: adminId,
        },
      });
    }
    await prisma.hearing.create({
      data: {
        caseId: c.id,
        scheduledDate: new Date(now.getTime() + 1 * day),
        hearingType: "BAIL_HEARING",
        outcome: "PENDING",
        recordedById: adminId,
      },
    });
    await prisma.task.create({
      data: {
        caseId: c.id,
        title: "Overdue, unassigned, blocked task",
        category: "OTHER",
        createdById: adminId,
        dueDate: new Date(now.getTime() - 30 * day),
        status: "BLOCKED",
        blockedReason: "Awaiting client response",
        blockedSince: new Date(now.getTime() - 20 * day),
        isPreparationTask: true,
      },
    });
    await prisma.documentRequirement.create({
      data: { caseId: c.id, documentType: "FIR_COPY", isMandatory: true, status: "MISSING" },
    });
    await prisma.documentRequirement.create({
      data: {
        caseId: c.id,
        documentType: "CHARGE_SHEET",
        isMandatory: true,
        status: "RECEIVED",
        requestedAt: new Date(now.getTime() - 30 * day),
        receivedAt: new Date(now.getTime() - 20 * day),
      },
    });
    caseIds.push(c.id);
  }

  return caseIds;
}
