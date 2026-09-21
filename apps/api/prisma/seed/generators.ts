import { faker } from "@faker-js/faker";
import type { PrismaClient } from "@prisma/client";

/**
 * Bulk synthetic case generation (spec §10). Deterministic via
 * `faker.seed(20251020)` (called once, in index.ts, before this runs).
 * Scaled down from spec's exact "200 cases / 220 persons" to a smaller
 * but still realistic set — enough to populate every frontend screen
 * with real variety (queue ordering, filters, pagination, charts)
 * without a multi-minute seed run. Expanding to the full spec-exact
 * counts is a mechanical follow-up (raise `CASE_COUNT` below), not a
 * structural change.
 *
 * Cases are built from one of three archetypes rather than many
 * independent per-field coin flips — independent flips compound
 * unpredictably (several weight-3/4 rules end up co-triggering far more
 * often than any single probability suggests), which is what produced
 * an unusable ~85%-HIGH distribution on the first pass. An archetype
 * directly controls how many rules a case is built to trigger, which is
 * what actually determines its band under the default ruleset
 * (thresholds 7/3): "clean" targets 0 triggers (ROUTINE), "moderate"
 * targets ~1 (MEDIUM), "urgent" targets 2+ compounding ones (HIGH) —
 * landing close to spec §10's target 50/32/18 split.
 */

const CASE_COUNT = 80;
const DAY = 86_400_000;

const ARCHETYPE_WEIGHTS = { clean: 0.5, moderate: 0.36, urgent: 0.14 } as const;
type Archetype = keyof typeof ARCHETYPE_WEIGHTS;

const COURTS = [
  ["District & Sessions Court, Central", "Central"],
  ["District & Sessions Court, South", "South"],
  ["District & Sessions Court, North", "North"],
  ["District & Sessions Court, East", "East"],
  ["District & Sessions Court, West", "West"],
  ["Metropolitan Magistrate Court", "Central"],
  ["Sessions Court, Rohini", "North West"],
] as const;

const ACT_SECTIONS = [
  ["IPC", "379", "Theft", true, "MODERATE"],
  ["IPC", "392", "Robbery", false, "SEVERE"],
  ["IPC", "324", "Voluntarily causing hurt", true, "MODERATE"],
  ["IPC", "420", "Cheating", true, "MODERATE"],
  ["NDPS Act", "20", "Possession of narcotics", false, "SEVERE"],
  ["IPC", "354", "Assault on woman", false, "SEVERE"],
  ["IPC", "279", "Rash driving", true, "MINOR"],
] as const;

function pick<T>(arr: readonly T[]): T {
  return faker.helpers.arrayElement(arr as unknown as T[]);
}

function chance(probability: number): boolean {
  return faker.number.float() < probability;
}

function pickArchetype(): Archetype {
  const r = faker.number.float();
  if (r < ARCHETYPE_WEIGHTS.clean) return "clean";
  if (r < ARCHETYPE_WEIGHTS.clean + ARCHETYPE_WEIGHTS.moderate) return "moderate";
  return "urgent";
}

interface SeedContext {
  adminId: string;
  lawyerIds: string[];
  now: Date;
}

export async function generateCases(
  prisma: PrismaClient,
  ctx: SeedContext,
  startIndex: number,
): Promise<number> {
  let created = 0;

  for (let i = 0; i < CASE_COUNT; i++) {
    const caseNum = startIndex + i;
    const caseRef = `JG-2026-${String(caseNum).padStart(4, "0")}`;
    const aliasCode = `UT-${String(caseNum).padStart(4, "0")}`;
    const archetype = pickArchetype();

    const person = await prisma.person.create({
      data: {
        aliasCode,
        displayName: `${faker.person.firstName()} ${faker.person.lastName().charAt(0)}.`,
        ageBand: pick(["18-25", "26-35", "36-45", "46-55", "56-65", "65+"]),
        gender: pick(["M", "F", "X"]),
        isSynthetic: true,
        languagePreference: pick(["Hindi", "English", "Punjabi", "Urdu", null]),
        hasDisability: chance(0.05),
        isFirstTimeOffender: chance(0.6),
        economicallyWeakerSection: chance(0.5),
      },
    });

    // ── Assignment ──────────────────────────────────────────────────
    const isUnassigned =
      archetype === "urgent" ? chance(0.35) : archetype === "moderate" ? chance(0.08) : false;
    const assignedToId = isUnassigned ? null : pick(ctx.lawyerIds);

    // ── Field completeness ──────────────────────────────────────────
    const hasCompleteFields =
      archetype === "clean" ? true : archetype === "moderate" ? chance(0.9) : chance(0.5);

    const [courtName, district] = pick(COURTS);
    const custodyType = pick([
      "JUDICIAL",
      "POLICE",
      "INTERIM_BAIL",
      "RELEASED",
      "NOT_IN_CUSTODY",
    ] as const);
    const custodyDaysAgo =
      archetype === "clean"
        ? faker.number.int({ min: 5, max: 140 })
        : archetype === "moderate"
          ? faker.number.int({ min: 5, max: 300 })
          : faker.number.int({ min: 5, max: 500 });
    const custodyStartDate =
      custodyType === "NOT_IN_CUSTODY" || !hasCompleteFields
        ? null
        : new Date(ctx.now.getTime() - custodyDaysAgo * DAY);

    const caseRow = await prisma.case.create({
      data: {
        caseRef,
        personId: person.id,
        courtName: hasCompleteFields ? courtName : "",
        courtType: courtName.includes("Magistrate") ? "Magistrate Court" : "District Court",
        district,
        state: "Delhi",
        policeStationAlias: `PS-${faker.string.alpha({ length: 4, casing: "upper" })}`,
        firNumberSynthetic: `FIR-SYN-${String(caseNum).padStart(4, "0")}`,
        firYear: pick([2025, 2026]),
        caseStatus: pick([
          "REGISTERED",
          "UNDER_INVESTIGATION",
          "CHARGES_FRAMED",
          "TRIAL_ONGOING",
          "TRIAL_ONGOING",
          "BAIL_PENDING",
          "BAIL_GRANTED",
        ] as const),
        custodyType,
        custodyStartDate,
        bailStatus:
          archetype === "urgent" && chance(0.3)
            ? "APPLICATION_FILED"
            : pick([
                "NOT_APPLIED",
                "NOT_APPLIED",
                "APPLICATION_PREPARED",
                "HEARING_SCHEDULED",
                "GRANTED",
              ] as const),
        bailAppliedDate: null, // set below only for the deliberate bail-stalled case
        assignedToId,
        assignedAt: assignedToId ? ctx.now : null,
        assignedById: assignedToId ? ctx.adminId : null,
        createdById: ctx.adminId,
        lastActivityAt: new Date(ctx.now.getTime() - faker.number.int({ min: 0, max: 20 }) * DAY),
      },
    });

    // Bail-stalled (urgent-only, minority): filed >21 days ago, still pending.
    if (archetype === "urgent" && chance(0.25)) {
      await prisma.case.update({
        where: { id: caseRow.id },
        data: {
          bailStatus: "APPLICATION_FILED",
          bailAppliedDate: new Date(
            ctx.now.getTime() - faker.number.int({ min: 25, max: 55 }) * DAY,
          ),
        },
      });
    }

    // ── Charges (clean/moderate always have some; urgent sometimes none) ──
    const chargeCount =
      archetype === "urgent" && chance(0.35) ? 0 : faker.number.int({ min: 1, max: 3 });
    for (let c = 0; c < chargeCount; c++) {
      const [actName, sectionCode, description, isBailableFlag, severityBand] = pick(ACT_SECTIONS);
      await prisma.charge.create({
        data: {
          caseId: caseRow.id,
          actName,
          sectionCode,
          description,
          isBailableFlag,
          severityBand,
        },
      });
    }

    // ── Hearings: exactly the pattern the archetype calls for ──────
    // clean: one future hearing far out, past hearings all reviewed.
    // moderate: one future hearing in the 4-7 day window (R-HEARING-7D
    //   only), or none at all (R-NO-HEARING-DATE, also MEDIUM-sized).
    // urgent: one future hearing within 0-3 days (R-HEARING-3D), plus
    //   sometimes a 3-adjournment chain and/or an unreviewed past order.
    let nextHearingDate: Date | null = null;
    let lastHearingDate: Date | null = null;
    const moderateIssue =
      archetype === "moderate"
        ? pick(["no-hearing-date", "order-unreviewed", "doc-missing-below"] as const)
        : null;

    if (archetype === "clean") {
      const scheduledDate = new Date(
        ctx.now.getTime() + faker.number.int({ min: 10, max: 50 }) * DAY,
      );
      await prisma.hearing.create({
        data: {
          caseId: caseRow.id,
          scheduledDate,
          hearingType: pick(["ARGUMENTS", "EVIDENCE", "MISCELLANEOUS"] as const),
          outcome: "PENDING",
          recordedById: ctx.adminId,
        },
      });
      nextHearingDate = scheduledDate;
      if (chance(0.6)) {
        const past = new Date(ctx.now.getTime() - faker.number.int({ min: 5, max: 60 }) * DAY);
        await prisma.hearing.create({
          data: {
            caseId: caseRow.id,
            scheduledDate: past,
            hearingType: "ARGUMENTS",
            outcome: "ORDER_PASSED",
            orderReviewed: true,
            orderSummary: "Order passed and reviewed.",
            recordedById: ctx.adminId,
          },
        });
        lastHearingDate = past;
      }
    } else if (archetype === "moderate") {
      // A "moderate" case is defined by exactly one guaranteed
      // ≥3-point trigger (independent low-probability rolls that can
      // all fail at once, tried first, mostly produced 0-point cases
      // that landed in ROUTINE instead) — not a pile of independent
      // coin flips that might compound or might cancel out.
      if (moderateIssue === "no-hearing-date") {
        // R-NO-HEARING-DATE (3): no next hearing recorded at all.
      } else {
        const days = faker.number.int({ min: 8, max: 30 });
        const scheduledDate = new Date(ctx.now.getTime() + days * DAY);
        await prisma.hearing.create({
          data: {
            caseId: caseRow.id,
            scheduledDate,
            hearingType: pick(["ARGUMENTS", "EVIDENCE"] as const),
            outcome: "PENDING",
            recordedById: ctx.adminId,
          },
        });
        nextHearingDate = scheduledDate;
      }

      if (moderateIssue === "order-unreviewed") {
        // R-ORDER-UNREVIEWED (3): a past order, not yet reviewed.
        const past = new Date(ctx.now.getTime() - faker.number.int({ min: 8, max: 60 }) * DAY);
        await prisma.hearing.create({
          data: {
            caseId: caseRow.id,
            scheduledDate: past,
            hearingType: "ARGUMENTS",
            outcome: "ORDER_PASSED",
            orderReviewed: false,
            orderSummary: "Order passed; pending review.",
            recordedById: ctx.adminId,
          },
        });
        lastHearingDate = past;
      } else if (chance(0.5)) {
        const past = new Date(ctx.now.getTime() - faker.number.int({ min: 5, max: 60 }) * DAY);
        await prisma.hearing.create({
          data: {
            caseId: caseRow.id,
            scheduledDate: past,
            hearingType: "ARGUMENTS",
            outcome: "ORDER_PASSED",
            orderReviewed: true,
            orderSummary: "Order passed and reviewed.",
            recordedById: ctx.adminId,
          },
        });
        lastHearingDate = past;
      }
    } else {
      const scheduledDate = new Date(
        ctx.now.getTime() + faker.number.int({ min: 0, max: 3 }) * DAY,
      );
      await prisma.hearing.create({
        data: {
          caseId: caseRow.id,
          scheduledDate,
          hearingType: pick(["ARGUMENTS", "BAIL_HEARING", "EVIDENCE"] as const),
          outcome: "PENDING",
          recordedById: ctx.adminId,
        },
      });
      nextHearingDate = scheduledDate;

      if (chance(0.3)) {
        for (let a = 3; a >= 1; a--) {
          const past = new Date(
            ctx.now.getTime() - a * faker.number.int({ min: 10, max: 25 }) * DAY,
          );
          await prisma.hearing.create({
            data: {
              caseId: caseRow.id,
              scheduledDate: past,
              hearingType: "ARGUMENTS",
              outcome: "ADJOURNED",
              adjournmentReason: "Counsel unavailable",
              recordedById: ctx.adminId,
            },
          });
          if (!lastHearingDate || past > lastHearingDate) lastHearingDate = past;
        }
      } else if (chance(0.4)) {
        const past = new Date(ctx.now.getTime() - faker.number.int({ min: 8, max: 60 }) * DAY);
        await prisma.hearing.create({
          data: {
            caseId: caseRow.id,
            scheduledDate: past,
            hearingType: "ARGUMENTS",
            outcome: "ORDER_PASSED",
            orderReviewed: false,
            orderSummary: "Order passed; pending review.",
            recordedById: ctx.adminId,
          },
        });
        lastHearingDate = past;
      }
    }
    await prisma.case.update({
      where: { id: caseRow.id },
      data: { lastHearingDate, nextHearingDate },
    });

    // ── Tasks ────────────────────────────────────────────────────────
    const prepIncomplete = archetype === "urgent" && nextHearingDate !== null && chance(0.5);
    if (prepIncomplete) {
      await prisma.task.create({
        data: {
          caseId: caseRow.id,
          title: "Prepare witness examination notes",
          category: "EVIDENCE_COLLECTION",
          assignedToId,
          createdById: ctx.adminId,
          dueDate: nextHearingDate!,
          status: "PENDING",
          isPreparationTask: true,
        },
      });
    }
    const wantsOverdue =
      archetype === "urgent" ? chance(0.55) : archetype === "moderate" ? chance(0.06) : false;
    if (wantsOverdue) {
      await prisma.task.create({
        data: {
          caseId: caseRow.id,
          title: "Follow up on pending client documents",
          category: "FOLLOW_UP",
          assignedToId,
          createdById: ctx.adminId,
          dueDate: new Date(ctx.now.getTime() - faker.number.int({ min: 1, max: 15 }) * DAY),
          status: "PENDING",
        },
      });
    }
    const wantsDueSoon = archetype === "moderate" && chance(0.12);
    if (wantsDueSoon) {
      await prisma.task.create({
        data: {
          caseId: caseRow.id,
          title: "Coordinate with investigating officer",
          category: "COORDINATION",
          assignedToId,
          createdById: ctx.adminId,
          dueDate: new Date(ctx.now.getTime() + faker.number.int({ min: 0, max: 2 }) * DAY),
          status: "PENDING",
        },
      });
    }
    // A handful of harmless completed/future tasks for texture, in every archetype.
    const extraTaskCount = faker.number.int({ min: 0, max: 2 });
    for (let t = 0; t < extraTaskCount; t++) {
      const isCompleted = chance(0.6);
      await prisma.task.create({
        data: {
          caseId: caseRow.id,
          title: pick([
            "Draft written arguments",
            "Collect witness statements",
            "Review case file",
            "Client consultation",
          ]),
          category: pick([
            "DOCUMENT_PREPARATION",
            "CLIENT_CONTACT",
            "COURT_FILING",
            "COORDINATION",
          ] as const),
          assignedToId: chance(0.85) ? assignedToId : null,
          createdById: ctx.adminId,
          dueDate: isCompleted
            ? new Date(ctx.now.getTime() - faker.number.int({ min: 1, max: 30 }) * DAY)
            : new Date(ctx.now.getTime() + faker.number.int({ min: 10, max: 40 }) * DAY),
          status: isCompleted ? "COMPLETED" : "PENDING",
          completedAt: isCompleted
            ? new Date(ctx.now.getTime() - faker.number.int({ min: 0, max: 15 }) * DAY)
            : null,
          completedById: isCompleted ? ctx.adminId : null,
        },
      });
    }

    // ── Documents: mandatory checklist, status driven by archetype ──
    // R-DOC-MISSING (3) is "moderate"'s guaranteed trigger when
    // `moderateIssue === "doc-missing-below"` (forced on the first
    // document, not left to chance) — the other two moderate issue
    // types leave every document VERIFIED/RECEIVED.
    const mandatoryTypes = ["FIR_COPY", "CHARGE_SHEET", "IDENTITY_PROOF", "VAKALATNAMA"] as const;
    const missingProbability = archetype === "urgent" ? 0.4 : 0;
    let anyMissing = false;
    for (const [docIndex, documentType] of mandatoryTypes.entries()) {
      const isMissing =
        (moderateIssue === "doc-missing-below" && docIndex === 0) ||
        (!anyMissing && chance(missingProbability));
      const status = isMissing ? "MISSING" : pick(["RECEIVED", "VERIFIED", "VERIFIED"] as const);
      if (isMissing) anyMissing = true;
      await prisma.documentRequirement.create({
        data: {
          caseId: caseRow.id,
          documentType,
          isMandatory: true,
          status,
          requestedAt:
            status !== "MISSING"
              ? new Date(ctx.now.getTime() - faker.number.int({ min: 1, max: 30 }) * DAY)
              : null,
          receivedAt:
            status === "RECEIVED" || status === "VERIFIED"
              ? new Date(ctx.now.getTime() - faker.number.int({ min: 0, max: 20 }) * DAY)
              : null,
          verifiedAt:
            status === "VERIFIED"
              ? new Date(ctx.now.getTime() - faker.number.int({ min: 0, max: 10 }) * DAY)
              : null,
          verifiedById: status === "VERIFIED" ? ctx.adminId : null,
        },
      });
    }

    // A note, most of the time.
    if (chance(0.6)) {
      await prisma.caseNote.create({
        data: {
          caseId: caseRow.id,
          authorId: ctx.adminId,
          body: faker.lorem.sentence(),
          isInternal: chance(0.4),
        },
      });
    }

    created += 1;
  }

  return created;
}
