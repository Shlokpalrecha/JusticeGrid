import { describe, it, expect } from "vitest";
import {
  evaluateCase,
  buildQueue,
  DEFAULT_POLICY,
  addMonths,
  calendarDays,
  civil,
  instant,
  nextCommitteeMeeting,
  validatePolicy,
  sha256Hex,
} from "../index.js";
import { deriveActions } from "../actions.js";
import { input, facts, action, NOW } from "./fixtures.js";
const run = (i: ReturnType<typeof input>, now = NOW) => evaluateCase(i, DEFAULT_POLICY, now);
describe("protected urgency and ordering", () => {
  it("keeps critical work above maximum routine support", () => {
    const urgent = run(
      input({
        actions: [
          action({
            critical: true,
            origin: "COURT_ORDER",
            sourceId: "S1",
            dueAt: "2026-10-30T06:30:00Z",
          }),
        ],
      }),
    );
    const routine = run(
      input({
        caseId: "routine",
        actions: [action({ blocker: "NECESSARY", criticalDataMissing: true })],
      }),
    );
    expect(urgent.priorityLevel).toBe("U0");
    expect(buildQueue([routine, urgent])[0]?.caseId).toBe("case-a");
  });
  it.each([
    [24, "U0"],
    [24.001, "U1"],
    [72, "U1"],
    [72.001, "U2"],
    [200, "U3"],
  ])("handles %s hours boundary", (h, level) => {
    expect(
      run(
        input({
          actions: [
            action({
              critical: true,
              origin: "STATUTE",
              dueAt: new Date(NOW.getTime() + Number(h) * 3600000).toISOString(),
            }),
          ],
        }),
      ).priorityLevel,
    ).toBe(level);
  });
  it("requires confidence and a structured deadline for immediate legal urgency", () =>
    expect(
      run(
        input({
          actions: [
            action({
              critical: true,
              origin: "STATUTE",
              confidence: "UNKNOWN",
              dueAt: NOW.toISOString(),
            }),
          ],
        }),
      ).priorityLevel,
    ).toBe("U2"));
  it("does not promote ordinary overdue work to U0", () =>
    expect(run(input({ actions: [action({ dueAt: "2020-01-01T00:00:00Z" })] })).priorityLevel).toBe(
      "U2",
    ));
  it("orders actual instants before support and uses case reference for exact ties", () => {
    const a = run(
      input({ caseRef: "A", actions: [action({ dueAt: "2026-10-30T12:00:00+05:30" })] }),
    );
    const b = run(
      input({
        caseId: "b",
        caseRef: "B",
        actions: [action({ dueAt: "2026-10-30T06:30:00Z", id: "000" })],
      }),
    );
    expect(buildQueue([b, a]).map((x) => x.caseRef)).toEqual(["A", "B"]);
  });
  it("protects urgent referrals even when their evidence is reported", () => {
    const r = run(
      input({
        facts: facts({
          urgentReports: [
            {
              id: "r",
              kind: "MEDICAL",
              reportedAt: NOW.toISOString(),
              details: "Reported urgent care need",
              confidence: "REPORTED",
              acknowledgedAt: null,
              resolvedAt: null,
            },
          ],
        }),
      }),
    );
    expect(r.priorityLevel).toBe("U0");
    expect(r.actions[0]?.warnings.length).toBeGreaterThan(0);
  });
  it("acknowledgement keeps referral open and uses its next review", () => {
    const r = run(
      input({
        actions: [
          action({
            type: "A01",
            origin: "IMMEDIATE_REFERRAL",
            acknowledgedAt: NOW.toISOString(),
            status: "ACKNOWLEDGED",
            nextReviewAt: "2026-10-30T00:00:00Z",
          }),
        ],
      }),
    );
    expect(r.priorityLevel).toBe("U1");
    expect(r.actions[0]?.orderingDeadline).toBe("2026-10-30T00:00:00Z");
  });
  it("cannot hide a critical action by override or create a routine U0", () => {
    expect(
      run(
        input({
          actions: [
            action({
              critical: true,
              origin: "STATUTE",
              dueAt: NOW.toISOString(),
              override: {
                urgency: "U3",
                reason: "test",
                reviewerId: "admin",
                expiresAt: "2026-11-01T00:00:00Z",
              },
            }),
          ],
        }),
      ).priorityLevel,
    ).toBe("U0");
    expect(
      run(
        input({
          actions: [
            action({
              override: {
                urgency: "U0",
                reason: "test",
                reviewerId: "admin",
                expiresAt: "2026-11-01T00:00:00Z",
              },
            }),
          ],
        }),
      ).priorityLevel,
    ).toBe("U3");
  });
  it("propagates critical dependency deadline through parents", () => {
    const r = run(
      input({
        actions: [
          action({ key: "parent" }),
          action({
            id: "child",
            key: "child",
            parentKey: "parent",
            critical: true,
            origin: "STATUTE",
            dueAt: NOW.toISOString(),
          }),
        ],
      }),
    );
    expect(r.actions.find((a) => a.key === "parent")?.orderingDeadline).toBe(NOW.toISOString());
  });
  it("caps duplicate and correlated contributions and ages from activation", () => {
    const a = action({ criticalDataMissing: true, blocker: "NECESSARY" });
    const r = run(input({ actions: [a, { ...a, id: "duplicate" }] }));
    expect(r.actions).toHaveLength(1);
    expect(r.supportScore).toBeLessThanOrEqual(20);
    expect(r.actions[0]?.components.F).toBe(3);
  });
  it("uses planned review dates for routine rows without inventing actions", () => {
    const r = run(input({ facts: facts({ nextPlannedReviewAt: "2026-12-01T00:00:00Z" }) }));
    expect(r.actions).toEqual([]);
    expect(r.plannedReviewAt).toBe("2026-12-01T00:00:00Z");
  });
});
describe("national workflow catalog", () => {
  it("distinguishes 24h receipt and 48h DLSA clocks", () => {
    const a = deriveActions(
      input({ facts: facts({ requestReceivedAt: NOW.toISOString() }) }),
      NOW.toISOString(),
    ).find((a) => a.type === "A02");
    const b = deriveActions(
      input({ facts: facts({ dlsaReceivedAt: NOW.toISOString(), representation: "REQUESTED" }) }),
      NOW.toISOString(),
    ).find((a) => a.type === "A03");
    expect(a?.dueAt).toBe("2026-10-30T06:30:00.000Z");
    expect(b?.dueAt).toBe("2026-10-31T06:30:00.000Z");
  });
  it("separates appointment from intimation and workflow owner from counsel", () => {
    const r = run(
      input({
        custodyType: "JUDICIAL",
        facts: facts({
          representation: "UNKNOWN",
          lawyerAppointedAt: NOW.toISOString(),
          counselAcceptedAt: null,
        }),
      }),
    );
    expect(r.actions.some((a) => a.type === "A03")).toBe(true);
    expect(r.actions.some((a) => a.type === "A04")).toBe(true);
  });
  it("creates release work immediately and keeps it on disposed cases", () => {
    const r = run(
      input({
        caseStatus: "DISPOSED",
        custodyType: "RELEASED",
        facts: facts({ bailGrantedAt: "2026-10-01T00:00:00Z" }),
      }),
    );
    expect(r.included).toBe(true);
    expect(r.actions.some((a) => a.type === "A07")).toBe(true);
    expect(r.actions.some((a) => a.type === "A08")).toBe(true);
  });
  it("actual release clears derived release work", () =>
    expect(
      run(
        input({
          facts: facts({
            bailGrantedAt: "2026-10-01T00:00:00Z",
            releaseConfirmedAt: NOW.toISOString(),
          }),
        }),
      ).actions.some((a) => a.type === "A07"),
    ).toBe(false));
  it.each(["A05", "A06", "A14"] as const)(
    "supports confirmed %s dates without a statute calculator",
    (type) => {
      const review = {
        id: "review",
        type,
        dueAt: NOW.toISOString(),
        precision: "INSTANT" as const,
        origin: "STATUTE" as const,
        sourceId: "S1",
        locator: "Confirmed section",
        basis: "Synthetic reviewed date",
        confirmedBy: "counsel",
        confirmedAt: "2026-10-01T00:00:00Z",
        profileId: "p",
        assumptions: "Reviewed exclusions",
        countingConvention: "Counsel confirmed",
        anchorAt: "2026-01-01T00:00:00Z",
        forthwith: false,
        completedAt: null,
      };
      const r = run(
        input({
          facts: facts({
            confirmedReviews: [review],
            procedure: "CRPC_SAVED",
            otherPendingCases: "TRUE",
          }),
        }),
      );
      expect(r.priorityLevel).toBe("U0");
      expect(
        run(
          input({
            facts: facts({
              confirmedReviews: [{ ...review, invalidatedReason: "Charges changed" }],
            }),
          }),
        ).priorityLevel,
      ).toBe("U1");
      expect(
        run(input({ facts: facts({ confirmedReviews: [{ ...review, precision: "DATE_ONLY" }] }) }))
          .priorityLevel,
      ).toBe("U1");
    },
  );
  it("does not invent default-bail cutoff for NDPS/UAPA or unknown history", () => {
    const r = run(
      input({
        custodyType: "JUDICIAL",
        facts: facts({
          procedure: "SPECIAL_OR_LOCAL",
          specialLaw: "UAPA",
          otherPendingCases: "UNKNOWN",
        }),
      }),
    );
    expect(r.actions.some((a) => a.type === "A16" && a.criticalDataMissing)).toBe(true);
    expect(r.actions.some((a) => a.type === "A05" && a.critical)).toBe(false);
  });
  it("keeps an invoked review after a later charge-sheet event", () => {
    const i = input({
      actions: [
        action({ type: "A05", critical: true, origin: "STATUTE", dueAt: NOW.toISOString() }),
      ],
      facts: facts({
        investigationEvents: [
          {
            id: "c",
            kind: "CHARGE_SHEET",
            at: NOW.toISOString(),
            reference: "Synthetic filing",
            confirmed: true,
          },
        ],
      }),
    });
    expect(run(i).priorityLevel).toBe("U0");
  });
  it("keeps requested documents unavailable and ages verification from receipt", () => {
    const d = {
      id: "d",
      name: "FIR",
      status: "REQUESTED",
      mandatory: true,
      hearingId: null,
      actionKey: null,
      requestedAt: "2026-01-01T00:00:00Z",
      receivedAt: null,
      createdAt: "2026-10-01T00:00:00Z",
    };
    expect(run(input({ documents: [d] })).actions[0]?.blocker).toBe("NECESSARY");
    expect(
      run(input({ documents: [{ ...d, status: "RECEIVED", receivedAt: NOW.toISOString() }] }))
        .actions[0]?.components.F,
    ).toBe(0);
  });
  it("does not count a preparation task for another hearing", () => {
    const h = {
      id: "h",
      scheduledAt: "2026-10-30T06:30:00Z",
      actualAt: null,
      outcome: "PENDING",
      wasProduced: false,
      orderExpected: false,
      orderReceivedAt: null,
      orderReviewed: false,
      createdAt: "2026-10-01T00:00:00Z",
    };
    const t = {
      id: "t",
      title: "prep",
      status: "PENDING",
      dueAt: h.scheduledAt,
      ownerId: "owner",
      hearingId: "other",
      actionKey: null,
      preparation: true,
      blocked: false,
      createdAt: h.createdAt,
    };
    expect(run(input({ hearings: [h], tasks: [t] })).actions.some((a) => a.type === "A10")).toBe(
      false,
    );
    const r = run(input({ hearings: [h], tasks: [{ ...t, hearingId: "h" }] }));
    expect(r.actions.find((a) => a.type === "A10")?.components.H).toBe(5);
  });
  it("future/cancelled hearings do not break past adjournment history", () => {
    const h = {
      id: "h",
      scheduledAt: "2026-10-01T00:00:00Z",
      actualAt: null,
      outcome: "ADJOURNED",
      wasProduced: false,
      orderExpected: false,
      orderReceivedAt: null,
      orderReviewed: false,
      createdAt: "2026-10-01T00:00:00Z",
    };
    const r = run(
      input({
        hearings: [
          h,
          { ...h, id: "2", scheduledAt: "2026-10-02T00:00:00Z" },
          { ...h, id: "3", scheduledAt: "2026-10-03T00:00:00Z" },
          { ...h, id: "future", scheduledAt: "2026-11-01T00:00:00Z", outcome: "PENDING" },
        ],
      }),
    );
    expect(r.consecutiveAdjournments).toBe(3);
  });
  it("tracks non-production and order obtain/review separately", () => {
    const h = {
      id: "h",
      scheduledAt: "2026-10-01T00:00:00Z",
      actualAt: null,
      outcome: "NOT_PRODUCED",
      wasProduced: false,
      orderExpected: true,
      orderReceivedAt: null,
      orderReviewed: false,
      createdAt: "2026-10-01T00:00:00Z",
    };
    const r = run(input({ hearings: [h] }));
    expect(r.actions.map((a) => a.type)).toContain("A11");
    expect(r.actions.find((a) => a.type === "A12")?.title).toBe("Obtain expected order");
  });
  it("supports qualified bail review and excludes financial scheme only, not assistance", () => {
    const f = facts();
    f.bailApplications = [
      {
        id: "b",
        filedAt: "2026-10-01T00:00:00Z",
        type: "REGULAR",
        outcomeAt: null,
        interveningApplication: true,
        differentMandate: false,
        nextReviewAt: null,
      },
    ];
    f.scheme = { ...f.scheme, applicability: "EXCLUDED", stage: "REPORT" };
    const r = run(input({ facts: f }));
    expect(r.actions.some((a) => a.type === "A13")).toBe(true);
    expect(r.actions.some((a) => a.type === "A09")).toBe(false);
  });
  it("UTRC recommendation is tracked until an outcome", () => {
    const f = facts();
    f.utrc = {
      ...f.utrc,
      categories: ["Woman undertrial"],
      verifiedBy: "reviewer",
      recommendationAt: "2026-10-01T00:00:00Z",
    };
    expect(run(input({ facts: f })).actions.some((a) => a.type === "A15")).toBe(true);
  });
  it("two-day follow-up and two-month communication are different recurrences", () => {
    const r = run(
      input({
        custodyType: "JUDICIAL",
        facts: facts({ representation: "NONE", undecidedSince: NOW.toISOString() }),
      }),
    );
    expect(r.actions.filter((a) => a.type === "A17")).toHaveLength(2);
  });
});
describe("episodes, clocks and determinism", () => {
  it("creates a fresh generated episode after a resolved condition recurs", () => {
    const i = input({ facts: facts({ requestReceivedAt: NOW.toISOString() }) }),
      first = run(i).actions[0]!;
    const next = run({
      ...i,
      actions: [
        { ...first, status: "RESOLVED", resolutionEvidence: "Source condition no longer present" },
      ],
    });
    expect(next.actions[0]?.key).not.toBe(first.key);
  });
  it("does not reset activation on reassignment or ordinary edits", () => {
    const i = input({ facts: facts({ requestReceivedAt: "2026-10-01T00:00:00Z" }) });
    const a = run(i).actions[0]!;
    const r = run({ ...i, assignedToId: "new-owner", actions: [a] });
    expect(r.actions[0]?.activatedAt).toBe(a.activatedAt);
    expect(r.actions[0]?.ownerId).toBe("new-owner");
  });
  it("changes temporal output and keys without edits", () => {
    const i = input({
      actions: [action({ critical: true, origin: "STATUTE", dueAt: "2026-10-30T06:31:00Z" })],
    });
    const a = run(i),
      b = run(i, new Date(NOW.getTime() + 120000));
    expect(a.factsHash).toBe(b.factsHash);
    expect(a.outcomeHash).not.toBe(b.outcomeHash);
    expect(b.priorityLevel).toBe("U0");
  });
  it("replays byte identically and does not mutate input", () => {
    const i = input(),
      copy = JSON.stringify(i);
    expect(run(i)).toEqual(run(i));
    expect(JSON.stringify(i)).toBe(copy);
  });
  it("calendar arithmetic preserves leap/month semantics", () => {
    expect(addMonths("2024-01-31T04:00:00Z", 1)).toBe("2024-02-29T04:00:00.000Z");
    expect(calendarDays("2026-10-29T18:29:00Z", "2026-10-29T18:31:00Z")).toBe(1);
    expect(civil("2026-10-29")).toBe("2026-10-29");
    expect(() => civil("2026-02-30")).toThrow();
    expect(() => instant("2026-10-29")).toThrow();
  });
  it("shifts committee holidays to the next working day", () =>
    expect(nextCommitteeMeeting("2026-11-01T00:00:00Z", ["2026-11-02"])).toBe(
      "2026-11-03T09:00:00+05:30",
    ));
  it("validates caps/windows and preserves SHA-256", () => {
    expect(() => validatePolicy({ ...DEFAULT_POLICY, immediateHours: 0 })).toThrow();
    expect(() =>
      validatePolicy({ ...DEFAULT_POLICY, weights: { ...DEFAULT_POLICY.weights, access: 5 } }),
    ).toThrow();
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
