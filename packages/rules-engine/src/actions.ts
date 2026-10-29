import {
  addCalendarDays,
  addHours,
  addMonths,
  calendarDays,
  instant,
  nextCommitteeMeeting,
  calendarEndOfNextDay,
} from "./clocks.js";
import type { ActionInput, ActionType, WorkflowInput } from "./workflowTypes.js";
const OPEN = new Set(["PENDING", "IN_PROGRESS", "BLOCKED"]);
const TERMINAL = new Set(["DISPOSED", "CLOSED", "TRANSFERRED"]);

/** Derive work from evidence, never infer legal entitlement or an unverified legal cutoff. */
export function deriveActions(input: WorkflowInput, now: string): ActionInput[] {
  const f = input.facts;
  const active = !input.isArchived && !TERMINAL.has(input.caseStatus);
  const custody = ["JUDICIAL", "POLICE"].includes(input.custodyType) && !f.releaseConfirmedAt;
  const releaseUnconfirmed = !!f.bailGrantedAt && !f.releaseConfirmedAt;
  const result: ActionInput[] = [];
  function add(
    type: ActionType,
    key: string,
    title: string,
    activatedAt: string,
    dueAt: string | null,
    patch: Partial<ActionInput> = {},
  ) {
    result.push({
      id: `auto:${input.caseId}:${key}`,
      key,
      sourceKey: key,
      nextReviewAt: null,
      type,
      title,
      status: "OPEN",
      activatedAt,
      dueAt,
      origin: "TEAM_TARGET",
      confidence: "CONFIRMED",
      sourceId: "TEAM",
      locator: "Operational review target",
      evidence: title,
      ownerId: input.assignedToId,
      critical: false,
      forthwith: false,
      retainedAfterClosure: false,
      parentKey: null,
      hearingId: null,
      blocker: "NONE",
      criticalDataMissing: false,
      ordinaryDataMissing: false,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionEvidence: null,
      override: null,
      ...patch,
    });
  }
  for (const report of f.urgentReports.filter((r) => !r.resolvedAt)) {
    add(
      "A01",
      `referral:${report.id}`,
      `${report.kind.replaceAll("_", " ")}: record referral and response`,
      report.reportedAt,
      report.reportedAt,
      {
        origin: "IMMEDIATE_REFERRAL",
        sourceId: "S3",
        locator: "Part C, section 8",
        confidence: report.confidence,
        evidence: report.details,
        retainedAfterClosure: true,
        acknowledgedAt: report.acknowledgedAt,
        nextReviewAt: report.nextReviewAt ?? null,
        status: report.acknowledgedAt ? "ACKNOWLEDGED" : "OPEN",
      },
    );
  }
  if (releaseUnconfirmed && f.bailGrantedAt) {
    if (!f.bailOrderCommunicatedAt)
      add(
        "A07",
        `bail-order:${f.bailGrantedAt}`,
        "Confirm bail order communication",
        f.bailGrantedAt,
        calendarEndOfNextDay(f.bailGrantedAt),
        {
          origin: "NATIONAL_PROCEDURE",
          sourceId: "S6",
          locator: "Direction 1: same or next day",
          retainedAfterClosure: true,
          criticalDataMissing: false,
        },
      );
    add(
      "A07",
      `release:${f.bailGrantedAt}`,
      "Follow up bail grant and actual release",
      f.bailGrantedAt,
      addCalendarDays(f.bailGrantedAt, 7),
      {
        origin: "NATIONAL_PROCEDURE",
        sourceId: "S6",
        locator: "Directions 2–4",
        retainedAfterClosure: true,
        blocker: "NECESSARY",
        evidence: `Release not confirmed. Barrier: ${f.nonReleaseReason ?? "UNKNOWN"}. Other detention: ${f.otherDetentionBarrier}. DLSA informed: ${f.dlsaInformedAt ?? "not recorded"}. A bail grant is not proof of release.`,
      },
    );
    if (!f.bondsFurnishedAt)
      add(
        "A08",
        `bonds:${f.bailGrantedAt}`,
        "Review unfurnished bonds and possible modification",
        f.bailGrantedAt,
        addMonths(f.bailGrantedAt, 1),
        {
          origin: "NATIONAL_PROCEDURE",
          sourceId: "S6",
          locator: "Direction 6 (court discretion)",
          retainedAfterClosure: true,
          evidence:
            "Court may consider modification after one calendar month; no automatic release.",
        },
      );
  }
  for (const review of f.confirmedReviews.filter((r) => !r.completedAt)) {
    const invalid = !!review.invalidatedReason;
    add(
      review.type,
      `legal-review:${review.id}`,
      review.type === "A05"
        ? "Counsel-confirmed investigation timing review"
        : review.type === "A06"
          ? "Counsel-confirmed prolonged-custody review"
          : "Counsel-confirmed evidence-stage review",
      review.confirmedAt,
      review.dueAt,
      {
        origin: invalid ? "TEAM_TARGET" : review.origin,
        critical: !invalid,
        forthwith: !invalid && review.forthwith,
        criticalDataMissing: invalid,
        sourceId: review.sourceId,
        locator: review.locator,
        retainedAfterClosure: true,
        evidence: `${invalid ? "Reconfirmation required: " + review.invalidatedReason + ". " : ""}${review.basis}; confirmed by ${review.confirmedBy}; profile ${review.profileId}; ${review.countingConvention}; ${review.assumptions}`,
        // A date-only legal record supplies a conservative TEAM review time, never an invented legal hour.
        ...(review.precision === "DATE_ONLY"
          ? {
              origin: "TEAM_TARGET" as const,
              critical: false,
              criticalDataMissing: true,
              evidence: `${review.basis}. Date-only legal date: verify the legal cutoff; displayed time is a team review target.`,
            }
          : {}),
      },
    );
  }
  function dependencies() {
    for (const a of [...input.actions, ...result]) {
      if (["RESOLVED", "CANCELLED"].includes(a.status) || (!active && !a.retainedAfterClosure))
        continue;
      const tasks = input.tasks.filter((t) => t.actionKey === a.key && OPEN.has(t.status));
      const docs = input.documents.filter(
        (d) =>
          d.actionKey === a.key &&
          d.mandatory &&
          !["VERIFIED", "NOT_APPLICABLE"].includes(d.status),
      );
      if (tasks.length || docs.length)
        add(
          "A16",
          `dependency:${a.key}`,
          "Clear dependencies: " + a.title,
          a.activatedAt,
          a.dueAt,
          {
            parentKey: a.key,
            retainedAfterClosure: a.retainedAfterClosure,
            blocker: "NECESSARY",
            evidence: `${tasks.length} linked task(s), ${docs.length} linked document(s) remain unresolved.`,
            origin: a.origin,
            critical: a.critical,
            confidence: a.confidence,
            sourceId: a.sourceId,
            locator: a.locator,
          },
        );
    }
  }
  if (
    (input.bailStatus === "GRANTED" || input.caseStatus === "BAIL_GRANTED") &&
    !f.bailGrantedAt &&
    !f.releaseConfirmedAt
  )
    add(
      "A16",
      "grant-date",
      "Verify bail-grant date and actual release",
      input.createdAt,
      addHours(input.createdAt, 24),
      {
        criticalDataMissing: true,
        retainedAfterClosure: true,
        evidence:
          "Bail is recorded as granted, but its date and actual release are unconfirmed. Verify the order and follow up release.",
      },
    );
  if (!active) {
    dependencies();
    return result;
  }
  if (
    ["APPLICATION_FILED", "HEARING_SCHEDULED"].includes(input.bailStatus ?? "") &&
    !f.bailApplications.length
  )
    add(
      "A16",
      "bail-application-date",
      "Verify recorded bail application and filing date",
      input.createdAt,
      addHours(input.createdAt, 24),
      {
        ordinaryDataMissing: true,
        evidence:
          "An application is recorded without a confirmed filing date. Verify status and qualified review timing; no legal deadline has been calculated.",
      },
    );
  if (f.requestReceivedAt && !f.dlsaReceivedAt)
    add(
      "A02",
      `aid-forward:${f.requestReceivedAt}`,
      "Forward legal-aid request to DLSA",
      f.requestReceivedAt,
      addHours(f.requestReceivedAt, 24),
      {
        origin: "NATIONAL_PROCEDURE",
        sourceId: "S3",
        locator: "7.1",
        evidence: "24 elapsed hours from receipt, including oral requests.",
      },
    );
  if (f.dlsaReceivedAt && !f.lawyerAppointedAt && f.representation !== "PRIVATE")
    add(
      "A03",
      `aid-appoint:${f.dlsaReceivedAt}`,
      "Confirm legal-aid lawyer appointment",
      f.dlsaReceivedAt,
      addHours(f.dlsaReceivedAt, 48),
      {
        origin: "NATIONAL_PROCEDURE",
        sourceId: "S3",
        locator: "7.2",
        evidence:
          "48 elapsed hours from DLSA receipt where no lawyer is appointed; check existing representation.",
      },
    );
  if (f.lawyerAppointedAt && !f.counselCommunicatedAt)
    add(
      "A03",
      `aid-intimate:${f.lawyerAppointedAt}`,
      "Communicate appointment details to the person",
      f.lawyerAppointedAt,
      f.lawyerAppointedAt,
      {
        origin: "NATIONAL_PROCEDURE",
        sourceId: "S3",
        locator: "7.3",
        evidence: "Appointment and intimation are separate steps; communication is immediate.",
      },
    );
  if (
    custody &&
    (["UNKNOWN", "NONE", "REQUESTED"].includes(f.representation) ||
      !f.counselAcceptedAt ||
      f.communicationBlocked ||
      f.interpreterNeeded)
  )
    add(
      "A04",
      "representation",
      "Verify effective legal representation and communication",
      input.createdAt,
      addHours(input.createdAt, 24),
      {
        sourceId: "S9",
        locator: "34; NALSA PLAC representation procedures",
        criticalDataMissing: f.representation === "UNKNOWN",
        evidence: `Representation: ${f.representation}. Workflow assignment does not establish representation. Interpreter needed: ${f.interpreterNeeded}; communication blocked: ${f.communicationBlocked}.`,
      },
    );
  const unknown = [
    (f.procedure === "UNKNOWN" || !f.legalProfileId) && "reviewed applicable procedure",
    !f.firstRemandAt && "first remand",
    !input.courtName && "court",
    (input.chargeCount === 0 || !f.currentChargesVerifiedAt) && "verified current charges",
    f.priorConvictions === "UNKNOWN" && "conviction history",
    f.otherPendingCases === "UNKNOWN" && "other proceedings",
    f.multipleOffences === "UNKNOWN" && "offence multiplicity",
    !f.confirmedReviews.some((r) => !r.completedAt && !r.invalidatedReason) &&
      "counsel-confirmed legal review dates",
  ].filter(Boolean);
  if (custody && unknown.length)
    add(
      "A16",
      "critical-facts",
      "Verify missing legal-clock facts",
      input.createdAt,
      addHours(input.createdAt, 24),
      {
        criticalDataMissing: true,
        evidence: `UNKNOWN: ${unknown.join(", ")}. No legal entitlement or statutory deadline calculated.`,
      },
    );
  if (!input.assignedToId)
    add(
      "A16",
      "ownership",
      "Allocate an accountable workflow owner",
      input.createdAt,
      addHours(input.createdAt, 24),
      { blocker: "NECESSARY" },
    );
  const completed = input.hearings.filter(
    (h) =>
      instant(h.actualAt ?? h.scheduledAt) <= instant(now) &&
      !["PENDING", "CANCELLED"].includes(h.outcome),
  );
  const future = input.hearings.filter(
    (h) => h.outcome === "PENDING" && calendarDays(now, h.scheduledAt) >= 0,
  );
  for (const h of future) {
    const tasks = input.tasks.filter(
      (t) => t.hearingId === h.id && t.preparation && OPEN.has(t.status),
    );
    const docs = input.documents.filter(
      (d) =>
        d.hearingId === h.id && d.mandatory && !["VERIFIED", "NOT_APPLICABLE"].includes(d.status),
    );
    if (
      tasks.length ||
      docs.length ||
      f.attendanceUnconfirmedHearingIds.includes(h.id) ||
      (custody && (!f.counselAcceptedAt || f.interpreterNeeded || f.communicationBlocked))
    )
      add(
        "A10",
        `hearing:${h.id}`,
        "Complete linked hearing preparation",
        h.createdAt,
        h.scheduledAt,
        {
          hearingId: h.id,
          blocker: docs.length || tasks.some((t) => t.blocked || !t.ownerId) ? "NECESSARY" : "NONE",
          evidence: `${tasks.length} open linked task(s); ${docs.length} unresolved linked document(s). Nested hearing windows count once.`,
        },
      );
  }
  for (const h of completed) {
    if (
      h.outcome === "NOT_PRODUCED" &&
      !input.actions.some((a) => a.key === `production-outcome:${h.id}` && a.status === "RESOLVED")
    )
      add(
        "A11",
        `production:${h.id}`,
        "Review recorded non-production",
        h.actualAt ?? h.scheduledAt,
        addHours(h.actualAt ?? h.scheduledAt, 24),
        {
          sourceId: "S12",
          locator: "11–12",
          evidence:
            "Recorded non-production requires human follow-up; this is not a finding of unlawful detention.",
        },
      );
    if (h.orderExpected && !h.orderReviewed)
      add(
        "A12",
        `order:${h.id}`,
        h.orderReceivedAt
          ? "Review received order and identify directions"
          : "Obtain expected order",
        h.orderReceivedAt ?? h.actualAt ?? h.scheduledAt,
        addHours(h.orderReceivedAt ?? h.actualAt ?? h.scheduledAt, 24),
        {
          sourceId: "S12",
          locator: "Team order follow-up target; directions must be separately confirmed",
          blocker: h.orderReceivedAt ? "NONE" : "NECESSARY",
        },
      );
  }
  const elapsedPending = input.hearings.filter(
    (h) => h.outcome === "PENDING" && calendarDays(h.scheduledAt, now) > 0,
  );
  if (
    elapsedPending.length ||
    (!future.length && ["UNKNOWN", "EXPECTED"].includes(f.nextHearingState))
  )
    add(
      "A11",
      "hearing-record",
      "Verify hearing outcome and expected next date",
      elapsedPending[0]?.scheduledAt ?? input.createdAt,
      addCalendarDays(elapsedPending[0]?.scheduledAt ?? input.createdAt, 3),
      {
        sourceId: "S12",
        locator: "11 and 16",
        criticalDataMissing: custody,
        evidence:
          "Missing data is not a confirmed missed appearance. Verify next date/purpose; do not reuse an elapsed cached date.",
      },
    );
  for (const task of input.tasks.filter(
    (t) =>
      OPEN.has(t.status) &&
      (!t.hearingId || !t.preparation || !future.some((h) => h.id === t.hearingId)) &&
      !t.actionKey,
  ))
    add("A16", `task:${task.id}`, task.title, task.createdAt, task.dueAt, {
      ownerId: task.ownerId,
      blocker: task.blocked || !task.ownerId ? "NECESSARY" : "NONE",
    });
  for (const d of input.documents.filter(
    (d) =>
      d.mandatory &&
      (!d.hearingId || !future.some((h) => h.id === d.hearingId)) &&
      !d.actionKey &&
      !["VERIFIED", "NOT_APPLICABLE"].includes(d.status),
  ))
    add(
      "A16",
      `document:${d.id}:${d.status === "RECEIVED" ? (d.receivedAt ?? "unknown-receipt") : "obtain"}`,
      d.status === "RECEIVED" ? `Verify ${d.name}` : `Obtain ${d.name}`,
      d.status === "RECEIVED" ? (d.receivedAt ?? d.createdAt) : d.createdAt,
      addCalendarDays(d.status === "RECEIVED" ? (d.receivedAt ?? d.createdAt) : d.createdAt, 2),
      {
        blocker: d.status === "RECEIVED" ? "NONE" : "NECESSARY",
        evidence: `${d.status}; requested ${d.requestedAt ?? "not recorded"}; received ${d.receivedAt ?? "not recorded"}. Requested does not mean available.`,
      },
    );
  for (const b of f.bailApplications.filter((b) => !b.outcomeAt))
    add(
      "A13",
      `bail-status:${b.id}`,
      "Review pending bail application status",
      b.filedAt,
      b.nextReviewAt ?? addCalendarDays(b.filedAt, b.type === "REGULAR" ? 14 : 42),
      {
        origin: "JUDICIAL_TARGET",
        sourceId: "S5",
        locator: "73(k), qualified judicial expectation",
        evidence: `Type ${b.type}; intervening application ${b.interveningApplication}; different mandate ${b.differentMandate}. Review exceptions; no automatic relief or blanket pause.`,
      },
    );
  if (f.scheme.applicability === "UNKNOWN" && f.scheme.stage !== "NONE")
    add(
      "A09",
      "scheme-applicability",
      "Verify financial-support scheme applicability",
      input.createdAt,
      addHours(input.createdAt, 24),
      {
        criticalDataMissing: true,
        sourceId: "S8",
        locator: "Undertrial exclusions and local adoption",
        evidence: "Scheme applicability is unknown; ordinary legal assistance remains available.",
      },
    );
  if (
    f.scheme.applicability === "CONFIRMED" &&
    f.scheme.stage !== "NONE" &&
    !f.scheme.completedAt
  ) {
    const due =
      f.scheme.confirmedDueAt ??
      (f.scheme.stage === "COMMITTEE" && f.scheme.calendarConfirmed && f.scheme.anchorAt
        ? nextCommitteeMeeting(f.scheme.anchorAt, f.scheme.holidays)
        : null);
    add(
      "A09",
      `scheme:${f.scheme.stage}:${f.scheme.anchorAt ?? "unknown"}`,
      due
        ? `Financial-support follow-up: ${f.scheme.stage}`
        : "Confirm financial-support stage clock",
      f.scheme.anchorAt ?? input.createdAt,
      due ?? addHours(input.createdAt, 24),
      {
        origin: f.scheme.confirmedDueAt ? "NATIONAL_PROCEDURE" : "TEAM_TARGET",
        sourceId: "S8",
        locator: "Undertrial procedure, confirmed stage and local applicability",
        criticalDataMissing: !due,
        evidence:
          (f.scheme.basis ??
            "Confirm applicability and event anchor. No automatic financial approval.") +
          (!f.scheme.confirmedDueAt && due
            ? " Calendar-only meeting: 09:00 India time is a team preparation target, not an official legal cutoff."
            : ""),
      },
    );
  }
  if (f.utrc.categories.length && !f.utrc.outcomeAt)
    add(
      "A15",
      `utrc:${f.utrc.recommendationAt ?? f.utrc.meetingAt ?? "preparation"}`,
      "Follow UTRC recommendation, application and outcome",
      f.utrc.recommendationAt ?? input.createdAt,
      f.utrc.meetingAt ?? f.nextPlannedReviewAt,
      {
        sourceId: "S4",
        locator: "2.2, Steps 3–5",
        criticalDataMissing: !f.utrc.verifiedBy,
        evidence: `Categories ${f.utrc.categories.join(", ")}; verified by ${f.utrc.verifiedBy ?? "UNKNOWN"}; application ${f.utrc.applicationAt ?? "not recorded"}; order ${f.utrc.orderAt ?? "not recorded"}. Young-adult age boundary remains manual-review-only.`,
      },
    );
  if (f.undecidedSince && !["APPOINTED", "PRIVATE"].includes(f.representation))
    add(
      "A17",
      `aid-followup:${f.lastAidFollowupAt ?? f.undecidedSince}`,
      "Follow up undecided legal-aid request",
      f.lastAidFollowupAt ?? f.undecidedSince,
      addCalendarDays(f.lastAidFollowupAt ?? f.undecidedSince, 2),
      { origin: "NATIONAL_PROCEDURE", sourceId: "S3", locator: "Part C, 8(a)" },
    );
  if (custody)
    add(
      "A17",
      `status:${f.lastStatusCommunicatedAt ?? input.createdAt}`,
      "Communicate meaningful case status",
      f.lastStatusCommunicatedAt ?? input.createdAt,
      addMonths(f.lastStatusCommunicatedAt ?? input.createdAt, 2),
      { origin: "NATIONAL_PROCEDURE", sourceId: "S3", locator: "Part D, 10: two calendar months" },
    );
  dependencies();
  return result;
}
