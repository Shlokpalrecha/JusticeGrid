import { describe, expect, it } from "vitest";
import {
  evaluateCase,
  buildQueue,
  compareActions,
  DEFAULT_POLICY,
  calendarEndOfNextDay,
  instant,
  nextCommitteeMeeting,
  validatePolicy,
  type Policy,
} from "../index.js";
import { facts, input, action, NOW } from "./fixtures.js";
const run = (i: ReturnType<typeof input>) => evaluateCase(i, DEFAULT_POLICY, NOW);
const hearing = (patch: Partial<ReturnType<typeof input>["hearings"][number]> = {}) => ({
  id: "h",
  scheduledAt: "2026-11-15T00:00:00Z",
  actualAt: null,
  outcome: "PENDING",
  wasProduced: false,
  orderExpected: false,
  orderReceivedAt: null,
  orderReviewed: false,
  createdAt: "2026-10-01T00:00:00Z",
  ...patch,
});
const doc = (patch: Partial<ReturnType<typeof input>["documents"][number]> = {}) => ({
  id: "d",
  name: "Order",
  status: "MISSING",
  mandatory: true,
  hearingId: null,
  actionKey: null,
  requestedAt: null,
  receivedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...patch,
});
const task = (patch: Partial<ReturnType<typeof input>["tasks"][number]> = {}) => ({
  id: "t",
  title: "Prepare",
  status: "PENDING",
  dueAt: "2026-11-15T00:00:00Z",
  ownerId: "owner",
  hearingId: null,
  actionKey: null,
  preparation: false,
  blocked: false,
  createdAt: "2026-10-01T00:00:00Z",
  ...patch,
});
describe("workflow source transitions", () => {
  it("surfaces inconsistent bail-granted case status and missing application anchors", () => {
    expect(run(input({ caseStatus: "BAIL_GRANTED" })).priorityLevel).toBe("U1");
    expect(
      run(input({ bailStatus: "APPLICATION_FILED" })).actions.some((a) => a.ordinaryDataMissing),
    ).toBe(true);
    expect(
      run(
        input({
          bailStatus: "HEARING_SCHEDULED",
          facts: facts({
            bailApplications: [
              {
                id: "app",
                filedAt: "2026-10-01T00:00:00Z",
                type: "REGULAR",
                outcomeAt: NOW.toISOString(),
                interveningApplication: false,
                differentMandate: false,
                nextReviewAt: null,
              },
            ],
          }),
        }),
      ).actions.some((a) => a.key === "bail-application-date"),
    ).toBe(false);
  });
  it("rejects impossible full-instant dates and keeps blocked routine work below U0", () => {
    expect(() => instant("2026-02-30T10:00:00Z")).toThrow();
    const r = run(input({ actions: [action({ status: "BLOCKED" })] }));
    expect(r.priorityLevel).toBe("U2");
    expect(r.actions[0]?.components.B).toBe(2);
  });
  it("keeps acknowledged referrals and their reported confidence", () => {
    const r = run(
      input({
        facts: facts({
          urgentReports: [
            {
              id: "x",
              kind: "CLAIMED_MINORITY",
              reportedAt: "2026-10-01T00:00:00Z",
              details: "Synthetic report",
              confidence: "CONFLICTING",
              acknowledgedAt: "2026-10-02T00:00:00Z",
              resolvedAt: null,
            },
          ],
        }),
      }),
    );
    expect(r.priorityLevel).toBe("U1");
    expect(r.actions[0]?.status).toBe("ACKNOWLEDGED");
  });
  it("uses next civil day for order communication, not 24 elapsed hours", () => {
    expect(calendarEndOfNextDay("2026-10-29T18:29:00Z")).toBe("2026-10-30T18:29:59.999Z");
    const f = facts({
      bailGrantedAt: "2026-10-01T00:00:00Z",
      nonReleaseReason: "Other proceeding",
      otherDetentionBarrier: "TRUE",
      dlsaInformedAt: "2026-10-08T00:00:00Z",
    });
    const r = run(input({ facts: f }));
    expect(r.actions.some((a) => a.key.startsWith("bail-order:"))).toBe(true);
    expect(
      run(
        input({
          facts: {
            ...f,
            bailOrderCommunicatedAt: "2026-10-02T00:00:00Z",
            bondsFurnishedAt: "2026-10-03T00:00:00Z",
          },
        }),
      ).actions.some((a) => a.type === "A08"),
    ).toBe(false);
  });
  it("retains verification when a granted bail record has no timestamp, including archived cases", () => {
    const r = run(input({ isArchived: true, bailStatus: "GRANTED" }));
    expect(r.included).toBe(true);
    expect(r.priorityLevel).toBe("U1");
  });
  it("does not manufacture a critical fact deficit from a complete reviewed record", () => {
    const r = run(
      input({
        custodyType: "JUDICIAL",
        facts: facts({
          confirmedReviews: [
            {
              id: "x",
              type: "A06",
              dueAt: "2027-01-01T00:00:00Z",
              precision: "INSTANT",
              origin: "STATUTE",
              sourceId: "S1",
              locator: "479",
              basis: "Synthetic review",
              confirmedBy: "reviewer",
              confirmedAt: "2026-01-01T00:00:00Z",
              profileId: "p",
              assumptions: "Reviewed",
              countingConvention: "Confirmed",
              anchorAt: "2025-01-01T00:00:00Z",
              forthwith: false,
              completedAt: null,
            },
          ],
        }),
      }),
    );
    expect(r.actions.some((a) => a.key === "critical-facts")).toBe(false);
  });
  it("distinguishes an existing lawyer's communication barrier from absent representation", () => {
    const r = run(
      input({
        custodyType: "POLICE",
        courtName: "",
        chargeCount: 0,
        facts: facts({
          representation: "PRIVATE",
          communicationBlocked: true,
          interpreterNeeded: true,
          procedure: "UNKNOWN",
          legalProfileId: null,
          firstRemandAt: null,
          currentChargesVerifiedAt: null,
          priorConvictions: "UNKNOWN",
          multipleOffences: "UNKNOWN",
          otherPendingCases: "UNKNOWN",
        }),
      }),
    );
    expect(r.actions.find((a) => a.type === "A04")?.components.A).toBe(2);
    expect(r.actions.some((a) => a.criticalDataMissing)).toBe(true);
  });
  it("attendance logistics contributes only the maximum nested hearing weight", () => {
    const i = input({
      hearings: [hearing()],
      facts: facts({ attendanceUnconfirmedHearingIds: ["h"] }),
    });
    expect(run(i).actions.find((a) => a.type === "A10")?.components.H).toBe(1);
    i.hearings[0]!.scheduledAt = "2026-11-03T00:00:00Z";
    expect(run(i).actions.find((a) => a.type === "A10")?.components.H).toBe(3);
    i.hearings[0]!.scheduledAt = "2026-10-30T00:00:00Z";
    expect(run(i).actions.find((a) => a.type === "A10")?.components.H).toBe(5);
  });
  it("linked missing documents and blocked or unallocated tasks are preparation dependencies", () => {
    const r = run(
      input({
        hearings: [hearing()],
        documents: [doc({ hearingId: "h" })],
        tasks: [task({ hearingId: "h", preparation: true, blocked: true, ownerId: null })],
      }),
    );
    expect(r.actions.find((a) => a.type === "A10")?.blocker).toBe("NECESSARY");
  });
  it("awaits the elapsed hearing outcome and retains documents linked to that hearing", () => {
    const r = run(
      input({
        hearings: [hearing({ scheduledAt: "2026-10-01T00:00:00Z" })],
        documents: [doc({ hearingId: "h", status: "RECEIVED" })],
        tasks: [task({ hearingId: "h", preparation: true, ownerId: null, blocked: true })],
      }),
    );
    expect(r.actions.some((a) => a.key === "hearing-record")).toBe(true);
    expect(r.actions.some((a) => a.title === "Verify Order")).toBe(true);
  });
  it("separates reviewing a newly received order from obtaining one", () => {
    const r = run(
      input({
        hearings: [
          hearing({
            scheduledAt: "2026-10-01T00:00:00Z",
            actualAt: "2026-10-02T00:00:00Z",
            outcome: "HELD",
            orderExpected: true,
            orderReceivedAt: NOW.toISOString(),
          }),
        ],
      }),
    );
    expect(r.actions.find((a) => a.type === "A12")?.title).toBe(
      "Review received order and identify directions",
    );
    expect(r.actions[0]?.components.F).toBe(0);
  });
  it("honours a recorded non-production outcome and completed order review", () => {
    const h = hearing({
      scheduledAt: "2026-10-01T00:00:00Z",
      outcome: "NOT_PRODUCED",
      orderExpected: true,
      orderReviewed: true,
    });
    expect(
      run(
        input({
          hearings: [h],
          actions: [action({ key: "production-outcome:h", status: "RESOLVED" })],
        }),
      ).actions,
    ).toEqual([]);
  });
  it.each(["UNKNOWN", "CONFIRMED"] as const)(
    "keeps %s scheme stages behind human applicability checks",
    (applicability) => {
      const f = facts();
      f.scheme = { ...f.scheme, applicability, stage: "REPORT" };
      const r = run(input({ facts: f }));
      expect(r.actions.find((a) => a.type === "A09")?.criticalDataMissing).toBe(true);
    },
  );
  it.each(["INTERACTION", "REPORT", "DEPOSIT", "REDUCTION"] as const)(
    "tracks a human-confirmed %s scheme date",
    (stage) => {
      const f = facts();
      f.scheme = {
        ...f.scheme,
        applicability: "CONFIRMED",
        stage,
        anchorAt: "2026-10-01T00:00:00Z",
        confirmedDueAt: "2026-10-30T00:00:00Z",
        basis: "Reviewed stage and local implementation",
      };
      expect(run(input({ facts: f })).actions.find((a) => a.type === "A09")?.origin).toBe(
        "NATIONAL_PROCEDURE",
      );
    },
  );
  it("uses an expressly confirmed committee calendar and keeps completion history", () => {
    const f = facts();
    f.scheme = {
      ...f.scheme,
      applicability: "CONFIRMED",
      stage: "COMMITTEE",
      anchorAt: "2026-11-01T00:00:00Z",
      calendarConfirmed: true,
      holidays: ["2026-11-02"],
    };
    expect(run(input({ facts: f })).actions[0]?.dueAt).toBe("2026-11-03T09:00:00+05:30");
    f.scheme.completedAt = NOW.toISOString();
    expect(run(input({ facts: f })).actions).toEqual([]);
  });
  it("keeps anticipatory-bail expectations qualified and respects a recorded next review", () => {
    const f = facts();
    f.bailApplications = [
      {
        id: "x",
        filedAt: "2026-10-01T00:00:00Z",
        type: "ANTICIPATORY",
        outcomeAt: null,
        interveningApplication: false,
        differentMandate: true,
        nextReviewAt: null,
      },
    ];
    expect(run(input({ facts: f })).actions[0]?.dueAt).toBe("2026-11-12T00:00:00.000Z");
    f.bailApplications[0]!.nextReviewAt = NOW.toISOString();
    expect(run(input({ facts: f })).actions[0]?.dueAt).toBe(NOW.toISOString());
  });
  it("tracks unverified UTRC preparation, meeting and application without implying release", () => {
    const f = facts();
    f.utrc = {
      ...f.utrc,
      categories: ["Human-selected category"],
      meetingAt: NOW.toISOString(),
      applicationAt: "2026-10-01T00:00:00Z",
      orderAt: "2026-10-02T00:00:00Z",
    };
    const r = run(input({ facts: f }));
    expect(r.priorityLevel).toBe("U1");
    expect(r.actions[0]?.evidence).toContain("UNKNOWN");
  });
  it("restarts communication/follow-up from the actual recorded event", () => {
    const f = facts({
      representation: "REQUESTED",
      undecidedSince: "2026-10-01T00:00:00Z",
      lastAidFollowupAt: NOW.toISOString(),
      lastStatusCommunicatedAt: null,
    });
    const r = run(input({ custodyType: "POLICE", assignedToId: null, facts: f }));
    expect(r.actions.find((a) => a.key.startsWith("aid-followup:"))?.dueAt).toBe(
      "2026-10-31T06:30:00.000Z",
    );
    expect(r.actions.some((a) => !a.ownerId)).toBe(true);
  });
  it("linked documents and tasks inherit retained parent deadline after closure", () => {
    const parent = action({
      retainedAfterClosure: true,
      critical: true,
      origin: "COURT_ORDER",
      dueAt: NOW.toISOString(),
    });
    const r = run(
      input({
        caseStatus: "CLOSED",
        actions: [parent],
        tasks: [task({ actionKey: parent.key })],
        documents: [doc({ actionKey: parent.key })],
      }),
    );
    expect(r.actions.find((a) => a.parentKey === parent.key)?.urgency).toBe("U0");
  });
});
describe("ordering and state boundaries", () => {
  it("uses non-null deadlines, support, waiting time and deterministic action keys to break ties", () => {
    const a = run(input({ actions: [action()] })).actions[0]!;
    expect(compareActions({ ...a, orderingDeadline: null }, a)).toBeGreaterThan(0);
    expect(compareActions(a, { ...a, orderingDeadline: null })).toBeLessThan(0);
    expect(compareActions({ ...a, orderingDeadline: null }, { ...a, orderingDeadline: null })).toBe(
      0,
    );
    expect(compareActions({ ...a, supportScore: 10 }, a)).toBeLessThan(0);
    expect(compareActions({ ...a, key: "a" }, { ...a, key: "z" })).toBeLessThan(0);
    expect(compareActions({ ...a, id: "a" }, { ...a, id: "z" })).toBeLessThan(0);
  });
  it("orders scheduled dates and case IDs for cases without actions", () => {
    const a = run(
      input({ caseId: "a", facts: facts({ nextPlannedReviewAt: "2026-11-01T00:00:00Z" }) }),
    );
    const b = run(input({ caseId: "b" }));
    expect(buildQueue([b, a])[0]?.caseId).toBe("a");
    expect(buildQueue([b, { ...b, caseId: "a" }])[0]?.caseId).toBe("a");
    expect(buildQueue([b, b])).toHaveLength(2);
  });
  it("preserves human closure, ownership and acknowledgement through generated refreshes", () => {
    const i = input({ facts: facts({ requestReceivedAt: "2026-10-01T00:00:00Z" }) });
    const a = run(i).actions[0]!;
    expect(
      run({
        ...i,
        actions: [{ ...a, status: "RESOLVED", resolutionEvidence: "Documented correction" }],
      }).actions,
    ).toEqual([]);
    expect(
      run({
        ...i,
        actions: [
          {
            ...a,
            status: "BLOCKED",
            ownerOverride: null,
            nextReviewAt: NOW.toISOString(),
            resolutionEvidence: "Contact recorded",
          },
        ],
      }).actions[0]?.ownerId,
    ).toBeNull();
    expect(run({ ...i, actions: [a] }).outcomeHash).toBe(run(i).outcomeHash);
  });
  it("records permitted overrides and ignores expired overrides", () => {
    const o = {
      urgency: "U1" as const,
      reason: "Coordinator review",
      expiresAt: "2026-11-01T00:00:00Z",
      reviewerId: "admin",
    };
    expect(run(input({ actions: [action({ override: o })] })).priorityLevel).toBe("U1");
    expect(
      run(input({ actions: [action({ override: { ...o, expiresAt: "2026-01-01T00:00:00Z" } })] }))
        .priorityLevel,
    ).toBe("U3");
  });
  it("forthwith human-confirmed directions and ordinary data remain distinct", () => {
    expect(
      run(input({ actions: [action({ critical: true, forthwith: true, origin: "COURT_ORDER" })] }))
        .priorityLevel,
    ).toBe("U0");
    const a = run(
      input({
        actions: [
          action({
            ordinaryDataMissing: true,
            blocker: "ORDINARY",
            activatedAt: NOW.toISOString(),
          }),
        ],
      }),
    ).actions[0]!;
    expect(a.components).toMatchObject({ B: 2, D: 1, F: 0 });
  });
  it("missing parents and closed children cannot move an action", () => {
    const r = run(
      input({
        actions: [
          action(),
          action({ id: "c", key: "child", parentKey: "missing", dueAt: null }),
          action({ id: "closed", key: "closed", parentKey: "event:one", status: "CANCELLED" }),
        ],
      }),
    );
    expect(r.actions).toHaveLength(2);
  });
  it("completed non-adjournment stops the streak; elapsed cancelled listings do not count", () => {
    const r = run(
      input({
        hearings: [
          hearing({ outcome: "HELD", scheduledAt: "2026-10-01T00:00:00Z" }),
          hearing({ id: "2", outcome: "CANCELLED", scheduledAt: "2026-10-02T00:00:00Z" }),
        ],
      }),
    );
    expect(r.consecutiveAdjournments).toBe(0);
  });
  it("rejects invalid instants and an unusable committee calendar", () => {
    expect(() => instant("2026-99-99T00:00:00Z")).toThrow();
    const holidays = Array.from({ length: 90 }, (_, i) =>
      new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
    );
    expect(() => nextCommitteeMeeting("2026-11-01T00:00:00Z", holidays)).not.toThrow();
  });
  it("rejects unsupported windows and weights", () => {
    const invalidPolicies = [
      { immediateHours: 49 },
      { sensitiveHours: 71 },
      { sensitiveHours: 169 },
      { hearingNearDays: 8 },
      { hearingWeekDays: 31 },
      { routineDays: 31 },
      { agingStepDays: 31 },
      ...[
        "hearingNear",
        "hearingWeek",
        "attendance",
        "access",
        "communication",
        "blocker",
        "ordinaryBlocker",
        "criticalData",
        "ordinaryData",
        "aging",
      ].map((key) => ({ weights: { ...DEFAULT_POLICY.weights, [key]: 20 } })),
      { weights: { ...DEFAULT_POLICY.weights, access: -1 } },
    ];
    for (const patch of invalidPolicies)
      expect(() => validatePolicy({ ...DEFAULT_POLICY, ...patch } as Policy)).toThrow();
  });
});
