import { describe, expect, it } from "vitest";
import { evaluateCase } from "../evaluate.js";
import type { CaseEvaluationInput, RuleDefinition } from "../types.js";
import { NOW, baseConfig, baseInput, baseRule } from "./fixtures.js";

/**
 * T5 (spec §11 traceability table): "Same input produces same priority."
 * This is the dedicated evidence file for that requirement — see
 * docs/08-traceability-matrix.md (Phase 12). evaluate.test.ts also
 * exercises determinism incidentally alongside other behaviour; this
 * file is the canonical, focused proof.
 */

function variedRules(): RuleDefinition[] {
  return [
    baseRule({
      id: "r1",
      code: "R-HEARING",
      conditionType: "HEARING_WITHIN_DAYS",
      params: { days: 5 },
      weight: 4,
    }),
    baseRule({
      id: "r2",
      code: "R-TASK",
      conditionType: "TASK_OVERDUE",
      params: { graceDays: 1 },
      weight: 3,
    }),
    baseRule({
      id: "r3",
      code: "R-DOC",
      conditionType: "MANDATORY_DOCUMENT_MISSING",
      params: {},
      weight: 2,
    }),
    baseRule({
      id: "r4",
      code: "R-CUSTODY",
      conditionType: "CUSTODY_DURATION_EXCEEDS_DAYS",
      params: { days: 90 },
      weight: 1,
    }),
  ];
}

const scenarios: { name: string; input: CaseEvaluationInput }[] = [
  { name: "nothing triggered", input: baseInput() },
  {
    name: "hearing + overdue task + missing document all triggered",
    input: baseInput({
      nextHearingDate: "2026-09-22",
      custodyStartDate: "2026-01-01",
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
    }),
  },
  {
    name: "every rule triggered simultaneously",
    input: baseInput({
      nextHearingDate: "2026-09-20",
      custodyType: "JUDICIAL",
      custodyStartDate: "2026-01-01",
      assignedToId: null,
      consecutiveAdjournments: 5,
      tasks: [
        {
          id: "t1",
          status: "BLOCKED",
          dueDate: "2026-08-01",
          assignedToId: null,
          isPreparationTask: true,
          blockedSince: "2026-08-15",
        },
      ],
      documents: [
        {
          id: "d1",
          documentType: "FIR_COPY",
          isMandatory: true,
          status: "REJECTED",
          requestedAt: "2026-08-01",
        },
      ],
    }),
  },
];

describe("determinism (spec §6.2, T5)", () => {
  it.each(scenarios)(
    "$name: repeated evaluation is deep-equal, including inputHash",
    ({ input }) => {
      const rules = variedRules();
      const config = baseConfig();

      const runs = Array.from({ length: 5 }, () => evaluateCase(input, rules, config, NOW));

      for (const run of runs.slice(1)) {
        expect(run).toEqual(runs[0]);
      }
    },
  );

  it("is independent of object key insertion order in the input", () => {
    const rules = variedRules();
    const config = baseConfig();
    const input = baseInput({ nextHearingDate: "2026-09-22" });

    // Same values, keys inserted in a different order.
    const reordered: CaseEvaluationInput = {
      documents: input.documents,
      tasks: input.tasks,
      lastHearing: input.lastHearing,
      consecutiveAdjournments: input.consecutiveAdjournments,
      bailAppliedDate: input.bailAppliedDate,
      bailStatus: input.bailStatus,
      lastActivityAt: input.lastActivityAt,
      lastHearingDate: input.lastHearingDate,
      nextHearingDate: input.nextHearingDate,
      custodyStartDate: input.custodyStartDate,
      custodyType: input.custodyType,
      caseStatus: input.caseStatus,
      assignedToId: input.assignedToId,
      caseRef: input.caseRef,
      caseId: input.caseId,
      requiredFieldsPresent: input.requiredFieldsPresent,
    };

    expect(evaluateCase(reordered, rules, config, NOW)).toEqual(
      evaluateCase(input, rules, config, NOW),
    );
  });

  it("is independent of the order rules are supplied in", () => {
    const config = baseConfig();
    const input = baseInput({ nextHearingDate: "2026-09-22" });
    const rules = variedRules();
    const shuffled = [rules[2], rules[0], rules[3], rules[1]] as RuleDefinition[];

    expect(evaluateCase(input, shuffled, config, NOW)).toEqual(
      evaluateCase(input, rules, config, NOW),
    );
  });

  it("changes inputHash (but not other fields' logic) when only rulesetVersion changes", () => {
    const rules = variedRules();
    const input = baseInput({ nextHearingDate: "2026-09-22" });
    const a = evaluateCase(input, rules, baseConfig({ version: 1 }), NOW);
    const b = evaluateCase(input, rules, baseConfig({ version: 2 }), NOW);
    expect(a.inputHash).not.toBe(b.inputHash);
    expect(a.rulesetVersion).toBe(1);
    expect(b.rulesetVersion).toBe(2);
    // The actual triggered logic (score/reasons) is unaffected by a bare
    // version bump with identical thresholds.
    expect(a.totalScore).toBe(b.totalScore);
  });
});
