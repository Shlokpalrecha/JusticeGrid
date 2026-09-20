import { describe, expect, it } from "vitest";
import { CONDITION_EVALUATORS } from "../conditions.js";
import type { CaseEvaluationInput, TaskInput } from "../types.js";
import { TODAY, baseInput } from "./fixtures.js";

function task(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: "task-1",
    status: "PENDING",
    dueDate: TODAY,
    assignedToId: "user-1",
    isPreparationTask: false,
    blockedSince: null,
    ...overrides,
  };
}

describe("HEARING_WITHIN_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.HEARING_WITHIN_DAYS;

  it("triggers when the hearing is comfortably within the window", () => {
    const input = baseInput({ nextHearingDate: "2026-09-21" });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger when there is no next hearing date", () => {
    const input = baseInput({ nextHearingDate: null });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(false);
  });

  it("boundary: triggers at exactly 0 days (today) and exactly `days` away, not one day beyond", () => {
    expect(evaluate(baseInput({ nextHearingDate: TODAY }), { days: 3 }, TODAY).triggered).toBe(
      true,
    );
    expect(
      evaluate(baseInput({ nextHearingDate: "2026-09-23" }), { days: 3 }, TODAY).triggered,
    ).toBe(true);
    expect(
      evaluate(baseInput({ nextHearingDate: "2026-09-24" }), { days: 3 }, TODAY).triggered,
    ).toBe(false);
  });

  it("does not trigger for a hearing date already in the past", () => {
    const input = baseInput({ nextHearingDate: "2026-09-19" });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(false);
  });
});

describe("HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE", () => {
  const evaluate = CONDITION_EVALUATORS.HEARING_WITHIN_DAYS_AND_PREP_INCOMPLETE;

  it("triggers when hearing is within days AND a prep task is incomplete", () => {
    const input = baseInput({
      nextHearingDate: "2026-09-21",
      tasks: [task({ isPreparationTask: true, status: "PENDING" })],
    });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger when hearing is within days but no prep task exists", () => {
    const input = baseInput({ nextHearingDate: "2026-09-21", tasks: [] });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when the only prep task is COMPLETED or CANCELLED", () => {
    const input = baseInput({
      nextHearingDate: "2026-09-21",
      tasks: [
        task({ isPreparationTask: true, status: "COMPLETED" }),
        task({ id: "t2", isPreparationTask: true, status: "CANCELLED" }),
      ],
    });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(false);
  });

  it("boundary: does not trigger once the hearing falls outside the day window, even with incomplete prep", () => {
    const input = baseInput({
      nextHearingDate: "2026-09-24",
      tasks: [task({ isPreparationTask: true, status: "PENDING" })],
    });
    expect(evaluate(input, { days: 3 }, TODAY).triggered).toBe(false);
  });
});

describe("HEARING_DATE_MISSING", () => {
  const evaluate = CONDITION_EVALUATORS.HEARING_DATE_MISSING;

  it("triggers for an active case with no next hearing date", () => {
    const input = baseInput({ caseStatus: "TRIAL_ONGOING", nextHearingDate: null });
    expect(evaluate(input, {}, TODAY).triggered).toBe(true);
  });

  it("does not trigger when a next hearing date is present", () => {
    const input = baseInput({ caseStatus: "TRIAL_ONGOING", nextHearingDate: "2026-10-01" });
    expect(evaluate(input, {}, TODAY).triggered).toBe(false);
  });

  it("boundary: does not trigger for each inactive case status, even with no next hearing date", () => {
    for (const status of ["DISPOSED", "CLOSED", "TRANSFERRED"]) {
      const input = baseInput({ caseStatus: status, nextHearingDate: null });
      expect(evaluate(input, {}, TODAY).triggered, `status=${status}`).toBe(false);
    }
  });
});

describe("TASK_OVERDUE", () => {
  const evaluate = CONDITION_EVALUATORS.TASK_OVERDUE;

  it("triggers for an open task overdue beyond the grace period", () => {
    const input = baseInput({ tasks: [task({ dueDate: "2026-09-10", status: "PENDING" })] });
    expect(evaluate(input, { graceDays: 0 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger for a task due today or in the future", () => {
    const input = baseInput({ tasks: [task({ dueDate: TODAY })] });
    expect(evaluate(input, { graceDays: 0 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger for COMPLETED/CANCELLED tasks regardless of due date", () => {
    const input = baseInput({
      tasks: [
        task({ dueDate: "2020-01-01", status: "COMPLETED" }),
        task({ id: "t2", dueDate: "2020-01-01", status: "CANCELLED" }),
      ],
    });
    expect(evaluate(input, { graceDays: 0 }, TODAY).triggered).toBe(false);
  });

  it("boundary: due yesterday is overdue with 0 grace days, due today is not", () => {
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: "2026-09-19" })] }), { graceDays: 0 }, TODAY)
        .triggered,
    ).toBe(true);
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: TODAY })] }), { graceDays: 0 }, TODAY).triggered,
    ).toBe(false);
  });

  it("boundary: grace period absorbs an overdue task exactly at its edge", () => {
    // Due 2 days ago with a 2-day grace period: 2 - 2 = 0, not > 0.
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: "2026-09-18" })] }), { graceDays: 2 }, TODAY)
        .triggered,
    ).toBe(false);
    // Due 3 days ago with a 2-day grace period: 3 - 2 = 1 > 0.
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: "2026-09-17" })] }), { graceDays: 2 }, TODAY)
        .triggered,
    ).toBe(true);
  });
});

describe("TASK_DUE_WITHIN_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.TASK_DUE_WITHIN_DAYS;

  it("triggers for an open task due within the window", () => {
    // 2026-09-21 is 1 day from TODAY (2026-09-20), within days:2.
    const input = baseInput({ tasks: [task({ dueDate: "2026-09-21" })] });
    expect(evaluate(input, { days: 2 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger for a task already overdue (negative days-until)", () => {
    const input = baseInput({ tasks: [task({ dueDate: "2026-09-19" })] });
    expect(evaluate(input, { days: 2 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger for tasks not in an open status", () => {
    const input = baseInput({ tasks: [task({ dueDate: TODAY, status: "COMPLETED" })] });
    expect(evaluate(input, { days: 2 }, TODAY).triggered).toBe(false);
  });

  it("boundary: due exactly `days` away triggers, one day beyond does not", () => {
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: "2026-09-22" })] }), { days: 2 }, TODAY)
        .triggered,
    ).toBe(true);
    expect(
      evaluate(baseInput({ tasks: [task({ dueDate: "2026-09-23" })] }), { days: 2 }, TODAY)
        .triggered,
    ).toBe(false);
  });
});

describe("TASK_UNASSIGNED", () => {
  const evaluate = CONDITION_EVALUATORS.TASK_UNASSIGNED;

  it("triggers for an open task with no assignee", () => {
    const input = baseInput({ tasks: [task({ assignedToId: null })] });
    expect(evaluate(input, {}, TODAY).triggered).toBe(true);
  });

  it("does not trigger when every open task has an assignee", () => {
    const input = baseInput({ tasks: [task({ assignedToId: "user-1" })] });
    expect(evaluate(input, {}, TODAY).triggered).toBe(false);
  });

  it("boundary: an unassigned task in a terminal status does not trigger", () => {
    const input = baseInput({ tasks: [task({ assignedToId: null, status: "COMPLETED" })] });
    expect(evaluate(input, {}, TODAY).triggered).toBe(false);
  });
});

describe("TASK_BLOCKED_OVER_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.TASK_BLOCKED_OVER_DAYS;

  it("triggers for a task blocked well beyond the threshold", () => {
    const input = baseInput({
      tasks: [task({ status: "BLOCKED", blockedSince: "2026-09-01" })],
    });
    expect(evaluate(input, { days: 7 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger for a non-BLOCKED task", () => {
    const input = baseInput({ tasks: [task({ status: "PENDING", blockedSince: "2026-09-01" })] });
    expect(evaluate(input, { days: 7 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger for a BLOCKED task with no blockedSince recorded", () => {
    const input = baseInput({ tasks: [task({ status: "BLOCKED", blockedSince: null })] });
    expect(evaluate(input, { days: 7 }, TODAY).triggered).toBe(false);
  });

  it("boundary: blocked for exactly the threshold does not trigger, one day more does", () => {
    expect(
      evaluate(
        baseInput({ tasks: [task({ status: "BLOCKED", blockedSince: "2026-09-13" })] }),
        { days: 7 },
        TODAY,
      ).triggered,
    ).toBe(false);
    expect(
      evaluate(
        baseInput({ tasks: [task({ status: "BLOCKED", blockedSince: "2026-09-12" })] }),
        { days: 7 },
        TODAY,
      ).triggered,
    ).toBe(true);
  });
});

describe("MANDATORY_DOCUMENT_MISSING", () => {
  const evaluate = CONDITION_EVALUATORS.MANDATORY_DOCUMENT_MISSING;

  it("triggers when a mandatory document is MISSING", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "MISSING",
          requestedAt: null,
        },
      ],
    });
    expect(evaluate(input, {}, TODAY).triggered).toBe(true);
  });

  it("triggers when a mandatory document is REJECTED", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "REJECTED",
          requestedAt: null,
        },
      ],
    });
    expect(evaluate(input, {}, TODAY).triggered).toBe(true);
  });

  it("does not trigger when the missing document is not mandatory", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "OTHER",
          isMandatory: false,
          status: "MISSING",
          requestedAt: null,
        },
      ],
    });
    expect(evaluate(input, {}, TODAY).triggered).toBe(false);
  });

  it("boundary: does not trigger once every mandatory document is VERIFIED", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "VERIFIED",
          requestedAt: "2026-09-01",
        },
      ],
    });
    expect(evaluate(input, {}, TODAY).triggered).toBe(false);
  });
});

describe("DOCUMENT_UNVERIFIED_OVER_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.DOCUMENT_UNVERIFIED_OVER_DAYS;

  it("triggers for a mandatory RECEIVED document stale well beyond the threshold", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "RECEIVED",
          requestedAt: "2026-09-01",
        },
      ],
    });
    expect(evaluate(input, { days: 10 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger once the document is VERIFIED", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "VERIFIED",
          requestedAt: "2026-09-01",
        },
      ],
    });
    expect(evaluate(input, { days: 10 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when requestedAt is unknown", () => {
    const input = baseInput({
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "RECEIVED",
          requestedAt: null,
        },
      ],
    });
    expect(evaluate(input, { days: 10 }, TODAY).triggered).toBe(false);
  });

  it("boundary: exactly at the threshold does not trigger, one day beyond does", () => {
    expect(
      evaluate(
        baseInput({
          documents: [
            {
              id: "d1",
              documentType: "FIR_COPY",
              isMandatory: true,
              status: "RECEIVED",
              requestedAt: "2026-09-10",
            },
          ],
        }),
        { days: 10 },
        TODAY,
      ).triggered,
    ).toBe(false);
    expect(
      evaluate(
        baseInput({
          documents: [
            {
              id: "d1",
              documentType: "FIR_COPY",
              isMandatory: true,
              status: "RECEIVED",
              requestedAt: "2026-09-09",
            },
          ],
        }),
        { days: 10 },
        TODAY,
      ).triggered,
    ).toBe(true);
  });
});

describe("CASE_FIELD_INCOMPLETE", () => {
  const evaluate = CONDITION_EVALUATORS.CASE_FIELD_INCOMPLETE;

  it("triggers when a listed field is false", () => {
    const input = baseInput({ requiredFieldsPresent: { courtName: true, charges: false } });
    expect(evaluate(input, { fields: ["courtName", "charges"] }, TODAY).triggered).toBe(true);
  });

  it("does not trigger when every listed field is true", () => {
    const input = baseInput({ requiredFieldsPresent: { courtName: true, charges: true } });
    expect(evaluate(input, { fields: ["courtName", "charges"] }, TODAY).triggered).toBe(false);
  });

  it("boundary: a field missing from the map entirely counts as incomplete", () => {
    const input = baseInput({ requiredFieldsPresent: { courtName: true } });
    expect(evaluate(input, { fields: ["courtName", "charges"] }, TODAY).triggered).toBe(true);
  });
});

describe("NO_ASSIGNEE", () => {
  const evaluate = CONDITION_EVALUATORS.NO_ASSIGNEE;

  it("triggers when the case has no assignee", () => {
    expect(evaluate(baseInput({ assignedToId: null }), {}, TODAY).triggered).toBe(true);
  });

  it("does not trigger when the case is assigned", () => {
    expect(evaluate(baseInput({ assignedToId: "user-1" }), {}, TODAY).triggered).toBe(false);
  });
});

describe("ORDER_NOT_REVIEWED_AFTER_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.ORDER_NOT_REVIEWED_AFTER_DAYS;

  it("triggers when the last hearing was well beyond the threshold ago and its order is unreviewed", () => {
    const input = baseInput({
      lastHearing: {
        id: "h1",
        scheduledDate: "2026-09-01",
        orderReviewed: false,
        orderRecordedAt: null,
      },
    });
    expect(evaluate(input, { days: 7 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger once the order has been reviewed", () => {
    const input = baseInput({
      lastHearing: {
        id: "h1",
        scheduledDate: "2026-09-01",
        orderReviewed: true,
        orderRecordedAt: null,
      },
    });
    expect(evaluate(input, { days: 7 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when there is no last hearing", () => {
    expect(evaluate(baseInput({ lastHearing: null }), { days: 7 }, TODAY).triggered).toBe(false);
  });

  it("boundary: exactly at the threshold does not trigger, one day beyond does", () => {
    expect(
      evaluate(
        baseInput({
          lastHearing: {
            id: "h1",
            scheduledDate: "2026-09-13",
            orderReviewed: false,
            orderRecordedAt: null,
          },
        }),
        { days: 7 },
        TODAY,
      ).triggered,
    ).toBe(false);
    expect(
      evaluate(
        baseInput({
          lastHearing: {
            id: "h1",
            scheduledDate: "2026-09-12",
            orderReviewed: false,
            orderRecordedAt: null,
          },
        }),
        { days: 7 },
        TODAY,
      ).triggered,
    ).toBe(true);
  });
});

describe("CUSTODY_DURATION_EXCEEDS_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.CUSTODY_DURATION_EXCEEDS_DAYS;

  it("triggers for JUDICIAL custody well beyond the threshold", () => {
    const input = baseInput({ custodyType: "JUDICIAL", custodyStartDate: "2026-01-01" });
    expect(evaluate(input, { days: 180 }, TODAY).triggered).toBe(true);
  });

  it("triggers for POLICE custody too", () => {
    const input = baseInput({ custodyType: "POLICE", custodyStartDate: "2026-01-01" });
    expect(evaluate(input, { days: 180 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger for NOT_IN_CUSTODY regardless of custodyStartDate", () => {
    const input = baseInput({ custodyType: "NOT_IN_CUSTODY", custodyStartDate: "2020-01-01" });
    expect(evaluate(input, { days: 180 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when custodyStartDate is unknown", () => {
    const input = baseInput({ custodyType: "JUDICIAL", custodyStartDate: null });
    expect(evaluate(input, { days: 180 }, TODAY).triggered).toBe(false);
  });

  it("boundary: exactly at the threshold does not trigger, one day beyond does", () => {
    // TODAY - 180 days = 2026-03-24; one day earlier start = 2026-03-23.
    expect(
      evaluate(
        baseInput({ custodyType: "JUDICIAL", custodyStartDate: "2026-03-24" }),
        { days: 180 },
        TODAY,
      ).triggered,
    ).toBe(false);
    expect(
      evaluate(
        baseInput({ custodyType: "JUDICIAL", custodyStartDate: "2026-03-23" }),
        { days: 180 },
        TODAY,
      ).triggered,
    ).toBe(true);
  });
});

describe("NO_ACTIVITY_SINCE_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.NO_ACTIVITY_SINCE_DAYS;

  it("triggers when the last activity is well beyond the threshold", () => {
    const input = baseInput({ lastActivityAt: "2026-08-01" });
    expect(evaluate(input, { days: 30 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger for recent activity", () => {
    const input = baseInput({ lastActivityAt: "2026-09-19" });
    expect(evaluate(input, { days: 30 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when lastActivityAt is unknown", () => {
    expect(evaluate(baseInput({ lastActivityAt: null }), { days: 30 }, TODAY).triggered).toBe(
      false,
    );
  });

  it("boundary: exactly at the threshold does not trigger, one day beyond does", () => {
    expect(
      evaluate(baseInput({ lastActivityAt: "2026-08-21" }), { days: 30 }, TODAY).triggered,
    ).toBe(false);
    expect(
      evaluate(baseInput({ lastActivityAt: "2026-08-20" }), { days: 30 }, TODAY).triggered,
    ).toBe(true);
  });
});

describe("BAIL_APPLICATION_STALLED_DAYS", () => {
  const evaluate = CONDITION_EVALUATORS.BAIL_APPLICATION_STALLED_DAYS;

  it("triggers for an APPLICATION_FILED bail stalled well beyond the threshold", () => {
    const input = baseInput({ bailStatus: "APPLICATION_FILED", bailAppliedDate: "2026-08-01" });
    expect(evaluate(input, { days: 21 }, TODAY).triggered).toBe(true);
  });

  it("triggers for HEARING_SCHEDULED too", () => {
    const input = baseInput({ bailStatus: "HEARING_SCHEDULED", bailAppliedDate: "2026-08-01" });
    expect(evaluate(input, { days: 21 }, TODAY).triggered).toBe(true);
  });

  it("does not trigger once bail has an outcome (GRANTED/REJECTED/WITHDRAWN)", () => {
    const input = baseInput({ bailStatus: "GRANTED", bailAppliedDate: "2026-08-01" });
    expect(evaluate(input, { days: 21 }, TODAY).triggered).toBe(false);
  });

  it("does not trigger when bailAppliedDate is unknown", () => {
    const input = baseInput({ bailStatus: "APPLICATION_FILED", bailAppliedDate: null });
    expect(evaluate(input, { days: 21 }, TODAY).triggered).toBe(false);
  });

  it("boundary: exactly at the threshold does not trigger, one day beyond does", () => {
    expect(
      evaluate(
        baseInput({ bailStatus: "APPLICATION_FILED", bailAppliedDate: "2026-08-30" }),
        { days: 21 },
        TODAY,
      ).triggered,
    ).toBe(false);
    expect(
      evaluate(
        baseInput({ bailStatus: "APPLICATION_FILED", bailAppliedDate: "2026-08-29" }),
        { days: 21 },
        TODAY,
      ).triggered,
    ).toBe(true);
  });
});

describe("HEARING_ADJOURNED_CONSECUTIVELY", () => {
  const evaluate = CONDITION_EVALUATORS.HEARING_ADJOURNED_CONSECUTIVELY;

  it("triggers when consecutive adjournments exceed the count", () => {
    expect(evaluate(baseInput({ consecutiveAdjournments: 5 }), { count: 3 }, TODAY).triggered).toBe(
      true,
    );
  });

  it("does not trigger below the count", () => {
    expect(evaluate(baseInput({ consecutiveAdjournments: 1 }), { count: 3 }, TODAY).triggered).toBe(
      false,
    );
  });

  it("boundary: exactly at the count triggers (threshold is inclusive, >=)", () => {
    expect(evaluate(baseInput({ consecutiveAdjournments: 3 }), { count: 3 }, TODAY).triggered).toBe(
      true,
    );
    expect(evaluate(baseInput({ consecutiveAdjournments: 2 }), { count: 3 }, TODAY).triggered).toBe(
      false,
    );
  });
});

describe("param validation", () => {
  it("throws a clear error when a required numeric param is missing or malformed", () => {
    const input: CaseEvaluationInput = baseInput();
    expect(() => CONDITION_EVALUATORS.HEARING_WITHIN_DAYS(input, {}, TODAY)).toThrow(/days/);
    expect(() => CONDITION_EVALUATORS.HEARING_WITHIN_DAYS(input, { days: "three" }, TODAY)).toThrow(
      /days/,
    );
  });

  it("throws a clear error when a required string-array param is missing or malformed", () => {
    const input: CaseEvaluationInput = baseInput();
    expect(() => CONDITION_EVALUATORS.CASE_FIELD_INCOMPLETE(input, {}, TODAY)).toThrow(/fields/);
    expect(() =>
      CONDITION_EVALUATORS.CASE_FIELD_INCOMPLETE(
        input,
        { fields: [1, 2] as unknown as string[] },
        TODAY,
      ),
    ).toThrow(/fields/);
  });
});
