import { describe, expect, it } from "vitest";
import { evaluateCase } from "../evaluate.js";
import { ENGINE_VERSION } from "../version.js";
import type { RuleDefinition } from "../types.js";
import { NOW, baseConfig, baseInput, baseRule } from "./fixtures.js";

/**
 * A worked scenario matching spec §6.4's example exactly: three rules
 * with weights 4, 4, 3 — coded so they sort A, B, C, matching the
 * expected reason order — that produce "4 + 4 + 3 = 11 → HIGH (≥ 7)".
 * The underlying facts mirror spec §10's Case A description (hearing
 * soon, an overdue task, a missing mandatory document); the exact rule
 * *codes* used to reproduce the fixture precisely (R-HEARING-3D vs.
 * R-HEARING-3D-PREP overlap in the real default ruleset) are Phase 7's
 * concern once the actual seed fixtures are written — see the note in
 * this package's README/docs (added in Phase 12).
 */
function workedExampleRules(): RuleDefinition[] {
  return [
    baseRule({
      id: "rule-a",
      code: "R-A-HEARING",
      name: "Hearing within 3 days",
      conditionType: "HEARING_WITHIN_DAYS",
      params: { days: 3 },
      weight: 4,
      displayTemplate: "Hearing is within {days} days ({nextHearingDate})",
    }),
    baseRule({
      id: "rule-b",
      code: "R-B-TASK-OVERDUE",
      name: "Follow-up task overdue",
      conditionType: "TASK_OVERDUE",
      params: { graceDays: 0 },
      weight: 4,
      displayTemplate: "{overdueTaskCount} follow-up task(s) overdue",
    }),
    baseRule({
      id: "rule-c",
      code: "R-C-DOC-MISSING",
      name: "Mandatory document missing",
      conditionType: "MANDATORY_DOCUMENT_MISSING",
      params: {},
      weight: 3,
      displayTemplate: "{missingDocumentCount} mandatory document(s) missing",
    }),
  ];
}

describe("evaluateCase — worked example (spec §6.4)", () => {
  const input = baseInput({
    nextHearingDate: "2026-09-21", // in 1 day
    tasks: [
      {
        id: "t1",
        status: "PENDING",
        dueDate: "2026-09-10",
        assignedToId: "u1",
        isPreparationTask: false,
        blockedSince: null,
      },
    ],
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

  it('produces exactly "4 + 4 + 3 = 11 → HIGH (≥ 7)"', () => {
    const result = evaluateCase(input, workedExampleRules(), baseConfig(), NOW);
    expect(result.rawScore).toBe(11);
    expect(result.totalScore).toBe(11);
    expect(result.priorityLevel).toBe("HIGH");
    expect(result.explanation).toBe("4 + 4 + 3 = 11 → HIGH (≥ 7)");
    expect(result.reasons).toHaveLength(3);
  });

  it("orders reasons by ascending rule code, independent of the input rule array's order", () => {
    const shuffledRules = [...workedExampleRules()].reverse();
    const result = evaluateCase(input, shuffledRules, baseConfig(), NOW);
    expect(result.reasons.map((r) => r.ruleCode)).toEqual([
      "R-A-HEARING",
      "R-B-TASK-OVERDUE",
      "R-C-DOC-MISSING",
    ]);
    expect(result.reasons.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
  });

  it("renders each reason's displayTemplate against its own evidence", () => {
    const result = evaluateCase(input, workedExampleRules(), baseConfig(), NOW);
    expect(result.reasons[0]?.reasonText).toBe("Hearing is within 3 days (2026-09-21)");
    expect(result.reasons[1]?.reasonText).toBe("1 follow-up task(s) overdue");
    expect(result.reasons[2]?.reasonText).toBe("1 mandatory document(s) missing");
  });

  it("populates engine/ruleset metadata and the injected evaluation timestamp", () => {
    const config = baseConfig({ version: 5 });
    const result = evaluateCase(input, workedExampleRules(), config, NOW);
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.rulesetVersion).toBe(5);
    expect(result.evaluatedAtIso).toBe(NOW.toISOString());
    expect(result.caseId).toBe(input.caseId);
  });
});

describe("evaluateCase — no trigger (spec §10 Case B)", () => {
  it('scores 0, bands ROUTINE, and explains "No time-sensitive workflow condition triggered"', () => {
    const input = baseInput({ nextHearingDate: "2026-10-15", tasks: [], documents: [] });
    const result = evaluateCase(input, workedExampleRules(), baseConfig(), NOW);
    expect(result.rawScore).toBe(0);
    expect(result.totalScore).toBe(0);
    expect(result.priorityLevel).toBe("ROUTINE");
    expect(result.reasons).toEqual([]);
    expect(result.explanation).toBe("No time-sensitive workflow condition triggered");
  });
});

describe("evaluateCase — disabled rules", () => {
  it("excludes disabled rules from scoring, reasons, and the input hash entirely", () => {
    const input = baseInput({ nextHearingDate: "2026-09-21" });
    const rules = workedExampleRules();
    const withAllEnabled = evaluateCase(input, rules, baseConfig(), NOW);

    const disabledHearingRule = rules.map((r) =>
      r.code === "R-A-HEARING" ? { ...r, isEnabled: false } : r,
    );
    const withOneDisabled = evaluateCase(input, disabledHearingRule, baseConfig(), NOW);

    expect(withAllEnabled.reasons.some((r) => r.ruleCode === "R-A-HEARING")).toBe(true);
    expect(withOneDisabled.reasons.some((r) => r.ruleCode === "R-A-HEARING")).toBe(false);
    expect(withOneDisabled.inputHash).not.toBe(withAllEnabled.inputHash);
  });
});

describe("evaluateCase — determinism (spec §6.2, T5)", () => {
  it("produces a deep-equal result for identical arguments, called twice", () => {
    const input = baseInput({
      nextHearingDate: "2026-09-21",
      tasks: [
        {
          id: "t1",
          status: "PENDING",
          dueDate: "2026-09-10",
          assignedToId: null,
          isPreparationTask: false,
          blockedSince: null,
        },
      ],
    });
    const rules = workedExampleRules();
    const config = baseConfig();

    const first = evaluateCase(input, rules, config, NOW);
    const second = evaluateCase(input, rules, config, NOW);

    expect(second).toEqual(first);
    expect(second.inputHash).toBe(first.inputHash);
  });

  it("is unaffected by the order rules are supplied in", () => {
    const input = baseInput({ nextHearingDate: "2026-09-21" });
    const rules = workedExampleRules();
    const reversed = [...rules].reverse();

    const a = evaluateCase(input, rules, baseConfig(), NOW);
    const b = evaluateCase(input, reversed, baseConfig(), NOW);

    expect(a).toEqual(b);
  });

  it("produces a different result when `now` moves the case outside a day-boundary condition", () => {
    const input = baseInput({ nextHearingDate: "2026-09-21" });
    const rules = workedExampleRules();
    const soon = evaluateCase(input, rules, baseConfig(), NOW);
    const later = evaluateCase(input, rules, baseConfig(), new Date("2026-10-01T04:00:00.000Z"));
    expect(later.reasons.some((r) => r.ruleCode === "R-A-HEARING")).toBe(false);
    expect(soon.reasons.some((r) => r.ruleCode === "R-A-HEARING")).toBe(true);
  });
});

describe("evaluateCase — cap behaviour", () => {
  it("caps totalScore while keeping reasons and rawScore uncapped", () => {
    const input = baseInput({
      nextHearingDate: "2026-09-21",
      tasks: [
        {
          id: "t1",
          status: "PENDING",
          dueDate: "2026-09-01",
          assignedToId: null,
          isPreparationTask: false,
          blockedSince: null,
        },
      ],
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
    const config = baseConfig({ maxScoreCap: 8 });
    const result = evaluateCase(input, workedExampleRules(), config, NOW);
    expect(result.rawScore).toBe(11);
    expect(result.totalScore).toBe(8);
    expect(result.reasons).toHaveLength(3);
    expect(result.explanation).toBe("4 + 4 + 3 = 11 (capped to 8) → HIGH (≥ 7)");
  });
});

describe("evaluateCase — rule ordering edge case", () => {
  it("two rules sharing the same code still both evaluate, in a stable relative order", () => {
    // Rule codes are meant to be unique (enforced by the DB's @unique
    // constraint in Phase 5's schema), but the comparator must still be
    // total: two equal codes fall through to Array.sort's stability
    // rather than throwing.
    const input = baseInput({ nextHearingDate: "2026-09-21", assignedToId: null });
    const rules: RuleDefinition[] = [
      baseRule({
        id: "r1",
        code: "R-SAME",
        conditionType: "HEARING_WITHIN_DAYS",
        params: { days: 3 },
        weight: 1,
      }),
      baseRule({ id: "r2", code: "R-SAME", conditionType: "NO_ASSIGNEE", params: {}, weight: 1 }),
    ];
    const result = evaluateCase(input, rules, baseConfig(), NOW);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.map((r) => r.ruleId)).toEqual(["r1", "r2"]);
  });
});
