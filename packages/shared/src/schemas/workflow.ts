import { z } from "zod";
const text = z.string().trim().min(1).max(5000);
const optionalText = text.nullable().default(null);
export const WorkflowInstantSchema = z.string().datetime({ offset: true });
const date = WorkflowInstantSchema.nullable().default(null);
export const ConfidenceSchema = z.enum(["CONFIRMED", "REPORTED", "UNKNOWN", "CONFLICTING"]);
const truth = z.enum(["TRUE", "FALSE", "UNKNOWN"]).default("UNKNOWN");
export const ActionTypeSchema = z.enum([
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "A09",
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "A17",
]);
export const ActionStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "BLOCKED",
  "RESOLVED",
  "CANCELLED",
]);
export const DeadlineOriginSchema = z.enum([
  "STATUTE",
  "COURT_ORDER",
  "NATIONAL_PROCEDURE",
  "JUDICIAL_TARGET",
  "TEAM_TARGET",
  "IMMEDIATE_REFERRAL",
]);
export const SourceIdSchema = z.enum([
  "CASE_ORDER",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
  "S11",
  "S12",
  "S13",
  "S14",
  "TEAM",
]);
const id = z.string().trim().min(1).max(300);
const review = z
  .object({
    invalidatedReason: text.optional(),
    id,
    type: z.enum(["A05", "A06", "A14"]),
    dueAt: WorkflowInstantSchema,
    precision: z.enum(["INSTANT", "DATE_ONLY"]),
    origin: z.enum(["STATUTE", "COURT_ORDER"]),
    sourceId: SourceIdSchema,
    locator: text,
    basis: text,
    confirmedBy: text,
    confirmedAt: WorkflowInstantSchema,
    profileId: id,
    assumptions: text,
    countingConvention: text,
    anchorAt: WorkflowInstantSchema,
    forthwith: z.boolean().default(false),
    completedAt: date,
  })
  .strict();
export const WorkflowFactsSchema = z
  .object({
    representation: z
      .enum(["UNKNOWN", "NONE", "REQUESTED", "APPOINTED", "PRIVATE"])
      .default("UNKNOWN"),
    counselName: optionalText,
    counselAcceptedAt: date,
    counselCommunicatedAt: date,
    requestReceivedAt: date,
    dlsaReceivedAt: date,
    lawyerAppointedAt: date,
    undecidedSince: date,
    lastAidFollowupAt: date,
    lastStatusCommunicatedAt: date,
    interpreterNeeded: z.boolean().default(false),
    communicationBlocked: z.boolean().default(false),
    lastMeaningfulContactAt: date,
    urgentReports: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["MEDICAL", "SAFEGUARDING", "CLAIMED_MINORITY"]),
            reportedAt: WorkflowInstantSchema,
            details: text,
            confidence: ConfidenceSchema,
            acknowledgedAt: date,
            nextReviewAt: date,
            resolvedAt: date,
          })
          .strict(),
      )
      .max(200)
      .default([]),
    procedure: z.enum(["UNKNOWN", "CRPC_SAVED", "BNSS", "SPECIAL_OR_LOCAL"]).default("UNKNOWN"),
    procedureBasis: optionalText,
    specialLaw: optionalText,
    legalProfileId: id.nullable().default(null),
    arrestAt: date,
    firstRemandAt: date,
    prisonAdmissionAt: date,
    custodyIntervals: z
      .array(z.object({ id, from: WorkflowInstantSchema, to: date, basis: text }).strict())
      .max(200)
      .default([]),
    excludedIntervals: z
      .array(
        z
          .object({
            id,
            from: WorkflowInstantSchema,
            to: WorkflowInstantSchema,
            orderReference: text,
          })
          .strict(),
      )
      .max(200)
      .default([]),
    priorConvictions: truth,
    otherPendingCases: truth,
    multipleOffences: truth,
    currentChargesVerifiedAt: date,
    punishmentBasis: optionalText,
    investigationEvents: z
      .array(
        z
          .object({
            id,
            kind: z.enum([
              "CHARGE_SHEET",
              "COMPLAINT",
              "DEFAULT_BAIL_INVOKED",
              "EXTENSION_REQUEST",
              "EXTENSION_ORDER",
            ]),
            at: WorkflowInstantSchema,
            reference: text,
            confirmed: z.boolean(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    confirmedReviews: z.array(review).max(100).default([]),
    bailGrantedAt: date,
    bailOrderCommunicatedAt: date,
    bondsFurnishedAt: date,
    releaseConfirmedAt: date,
    nonReleaseReason: optionalText,
    dlsaInformedAt: date,
    otherDetentionBarrier: truth,
    bailApplications: z
      .array(
        z
          .object({
            id,
            filedAt: WorkflowInstantSchema,
            type: z.enum(["REGULAR", "ANTICIPATORY"]),
            outcomeAt: date,
            interveningApplication: z.boolean().default(false),
            differentMandate: z.boolean().default(false),
            nextReviewAt: date,
          })
          .strict(),
      )
      .max(100)
      .default([]),
    scheme: z
      .object({
        applicability: z.enum(["UNKNOWN", "CONFIRMED", "EXCLUDED"]).default("UNKNOWN"),
        stage: z
          .enum(["NONE", "INTERACTION", "REPORT", "COMMITTEE", "DEPOSIT", "REDUCTION"])
          .default("NONE"),
        anchorAt: date,
        confirmedDueAt: date,
        basis: optionalText,
        calendarConfirmed: z.boolean().default(false),
        holidays: z
          .array(
            z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .refine((v) => {
                const d = new Date(v + "T00:00:00Z");
                return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
              }, "Invalid calendar date"),
          )
          .max(400)
          .default([]),
        completedAt: date,
      })
      .strict()
      .default({}),
    utrc: z
      .object({
        categories: z.array(text).max(30).default([]),
        verifiedBy: optionalText,
        meetingAt: date,
        recommendationAt: date,
        applicationAt: date,
        orderAt: date,
        outcomeAt: date,
        notes: optionalText,
      })
      .strict()
      .default({}),
    firstEvidenceDate: date,
    custodyThroughoutEvidence: truth,
    recordedCourtException: optionalText,
    nextHearingState: z
      .enum(["UNKNOWN", "EXPECTED", "AWAITING_LISTING", "NOT_APPLICABLE"])
      .default("UNKNOWN"),
    nextPlannedReviewAt: date,
    attendanceUnconfirmedHearingIds: z.array(id).max(200).default([]),
  })
  .strict();
export type WorkflowFacts = z.infer<typeof WorkflowFactsSchema>;
export const WorkflowUpdateSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    facts: WorkflowFactsSchema,
    changeReason: text,
  })
  .strict();
export function validateWorkflowChronology(f: WorkflowFacts, now: Date): string[] {
  const errors: string[] = [];
  const sequence = (name: string, values: (string | null)[]) => {
    const timestamps = values.filter((v): v is string => !!v).map(Date.parse);
    if (timestamps.some((v, i) => i > 0 && v < timestamps[i - 1]!))
      errors.push(`${name}: events are out of order`);
    if (timestamps.some((v) => !Number.isFinite(v))) errors.push(`${name}: invalid timestamp`);
    if (timestamps.some((v) => v > now.getTime()))
      errors.push(`${name}: completed events cannot be in the future`);
  };
  sequence("custody", [f.arrestAt, f.firstRemandAt, f.prisonAdmissionAt]);
  sequence("legal aid", [
    f.requestReceivedAt,
    f.dlsaReceivedAt,
    f.lawyerAppointedAt,
    f.counselCommunicatedAt,
  ]);
  sequence("bail/release", [f.bailGrantedAt, f.bailOrderCommunicatedAt, f.releaseConfirmedAt]);
  sequence("bonds", [f.bailGrantedAt, f.bondsFurnishedAt]);
  for (const r of f.urgentReports)
    sequence(`referral ${r.id}`, [r.reportedAt, r.acknowledgedAt, r.resolvedAt]);
  for (const r of f.urgentReports)
    if (r.acknowledgedAt && !r.resolvedAt && !r.nextReviewAt)
      errors.push(`Referral ${r.id}: acknowledgement requires an explicit next review`);
  for (const r of f.custodyIntervals) sequence(`custody interval ${r.id}`, [r.from, r.to]);
  for (const r of f.excludedIntervals) sequence(`excluded interval ${r.id}`, [r.from, r.to]);
  for (const r of f.bailApplications) sequence(`application ${r.id}`, [r.filedAt, r.outcomeAt]);
  for (const r of f.confirmedReviews) sequence(`confirmation ${r.id}`, [r.anchorAt, r.confirmedAt]);
  for (const r of f.confirmedReviews)
    if (Date.parse(r.dueAt) < Date.parse(r.anchorAt))
      errors.push(`Review ${r.id}: due date cannot precede its event anchor`);
  sequence("contact", [f.lastMeaningfulContactAt]);
  sequence("counsel acceptance", [f.counselAcceptedAt]);
  sequence("legal aid follow-up", [f.undecidedSince, f.lastAidFollowupAt]);
  sequence("charge verification", [f.currentChargesVerifiedAt]);
  sequence("evidence", [f.firstEvidenceDate]);
  sequence("status communication", [f.lastStatusCommunicatedAt]);
  sequence("DLSA intimation", [f.bailGrantedAt, f.dlsaInformedAt]);
  sequence("scheme", [f.scheme.anchorAt, f.scheme.completedAt]);
  for (const e of f.investigationEvents) sequence("investigation event", [e.at]);
  for (const e of f.confirmedReviews) sequence("review completion", [e.confirmedAt, e.completedAt]);
  sequence("UTRC", [
    f.utrc.recommendationAt,
    f.utrc.applicationAt,
    f.utrc.orderAt,
    f.utrc.outcomeAt,
  ]);
  if (["APPOINTED", "PRIVATE"].includes(f.representation) && !f.counselName)
    errors.push("Record counsel name for appointed/private representation");
  if (f.procedure !== "UNKNOWN" && !f.procedureBasis)
    errors.push("Procedure confirmation requires its basis");
  for (const key of [
    "urgentReports",
    "confirmedReviews",
    "custodyIntervals",
    "excludedIntervals",
    "investigationEvents",
    "bailApplications",
  ] as const) {
    const ids = f[key].map((v) => v.id);
    if (new Set(ids).size !== ids.length) errors.push(`${key}: duplicate occurrence IDs`);
  }
  for (const intervals of [f.custodyIntervals, f.excludedIntervals]) {
    const sorted = [...intervals].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
    if (
      sorted.some(
        (r, i) =>
          i > 0 &&
          Date.parse(r.from) < (sorted[i - 1]!.to ? Date.parse(sorted[i - 1]!.to!) : Infinity),
      )
    )
      errors.push("Custody/exclusion intervals must not overlap within the same timeline");
  }
  return errors;
}
export const TextRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    when: z.string().min(1).max(8000),
    urgency: z.enum(["U0", "U1", "U2", "U3"]).optional(),
    component: z.enum(["H", "A", "B", "D", "F"]).optional(),
    value: z.string().min(1).max(8000).optional(),
    dependsOn: z.array(z.string().max(64)).max(128).optional(),
  })
  .strict();
export const PolicySchema = z
  .object({
    textRules: z.array(TextRuleSchema).min(1).max(128).optional(),
    immediateHours: z.number().int().min(24).max(48),
    sensitiveHours: z.number().int().min(72).max(168),
    routineDays: z.number().int().min(1).max(30),
    hearingNearDays: z.number().int().min(1).max(30),
    hearingWeekDays: z.number().int().min(1).max(30),
    agingStepDays: z.number().int().min(1).max(30),
    weights: z
      .object({
        hearingNear: z.number().int().min(0).max(5),
        hearingWeek: z.number().int().min(0).max(5),
        attendance: z.number().int().min(0).max(5),
        access: z.number().int().min(0).max(4),
        communication: z.number().int().min(0).max(4),
        blocker: z.number().int().min(0).max(4),
        ordinaryBlocker: z.number().int().min(0).max(4),
        criticalData: z.number().int().min(0).max(4),
        ordinaryData: z.number().int().min(0).max(4),
        aging: z.number().int().min(0).max(3),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const w = p.weights;
    if (
      p.immediateHours >= p.sensitiveHours ||
      p.hearingNearDays > p.hearingWeekDays ||
      w.hearingWeek > w.hearingNear ||
      w.attendance > w.hearingNear ||
      w.communication > w.access ||
      w.ordinaryBlocker > w.blocker ||
      w.ordinaryData > w.criticalData
    )
      ctx.addIssue({ code: "custom", message: "Nested windows/weights must be ordered" });
  });
export const PolicyPublishSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    config: PolicySchema,
    changeReason: text,
  })
  .strict();
export const PolicySimulateSchema = z.object({ config: PolicySchema }).strict();
export const ProfileCreateSchema = z
  .object({
    name: text,
    version: z.number().int().positive(),
    sourceId: SourceIdSchema,
    locator: text,
    territory: text,
    procedure: z.enum(["BNSS", "CRPC_SAVED", "SPECIAL_OR_LOCAL", "NATIONAL_PROCEDURE"]),
    effectiveFrom: WorkflowInstantSchema,
    verifiedAt: WorkflowInstantSchema,
    verificationNotes: text,
    supersedesId: id.nullable().default(null),
  })
  .strict();
export const ActionCreateSchema = z
  .object({
    type: ActionTypeSchema,
    anchorReference: id,
    occurrenceId: id,
    title: text,
    activatedAt: WorkflowInstantSchema,
    dueAt: date,
    origin: DeadlineOriginSchema,
    confidence: ConfidenceSchema,
    sourceId: SourceIdSchema,
    locator: text,
    evidence: text,
    ownerId: id.nullable().default(null),
    critical: z.boolean().default(false),
    forthwith: z.boolean().default(false),
    retainedAfterClosure: z.boolean().default(false),
    parentKey: id.nullable().default(null),
    hearingId: id.nullable().default(null),
    blocker: z.enum(["NONE", "ORDINARY", "NECESSARY"]).default("NONE"),
    criticalDataMissing: z.boolean().default(false),
    ordinaryDataMissing: z.boolean().default(false),
    profileId: id.nullable().default(null),
    precision: z.enum(["INSTANT", "DATE_ONLY"]).default("INSTANT"),
    countingConvention: optionalText,
    anchorAt: date,
  })
  .strict()
  .superRefine((a, ctx) => {
    if (
      a.critical &&
      (!a.profileId ||
        !a.dueAt ||
        a.confidence !== "CONFIRMED" ||
        !["STATUTE", "COURT_ORDER"].includes(a.origin) ||
        a.sourceId === "TEAM" ||
        !a.countingConvention ||
        !a.anchorAt ||
        a.precision !== "INSTANT")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Critical dates require a verified profile, precise confirmed deadline, anchor, source and counting convention",
      });
    if (a.forthwith && !a.critical)
      ctx.addIssue({ code: "custom", message: "Forthwith requires a confirmed critical action" });
  });
export const ActionTransitionSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    status: ActionStatusSchema,
    evidence: text,
    nextReviewAt: date,
  })
  .strict();
export const ActionOverrideSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    urgency: z.enum(["U0", "U1", "U2", "U3"]),
    reason: text,
    expiresAt: WorkflowInstantSchema,
  })
  .strict();

export const ActionAssignSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    ownerId: id.nullable(),
    reason: text,
  })
  .strict();
