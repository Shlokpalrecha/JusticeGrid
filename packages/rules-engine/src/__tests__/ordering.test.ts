import { describe, expect, it } from "vitest";
import { buildQueue } from "../ordering.js";
import type { CaseEvaluationInput, EvaluationResult, TaskInput } from "../types.js";
import { baseInput } from "./fixtures.js";

function result(
  caseId: string,
  totalScore: number,
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    caseId,
    rawScore: totalScore,
    totalScore,
    priorityLevel: totalScore >= 7 ? "HIGH" : totalScore >= 3 ? "MEDIUM" : "ROUTINE",
    reasons: [],
    rulesetVersion: 1,
    engineVersion: "1.0.0",
    inputHash: "hash",
    evaluatedAtIso: "2026-09-20T00:00:00.000Z",
    explanation: "",
    ...overrides,
  };
}

function input(
  caseId: string,
  caseRef: string,
  overrides: Partial<CaseEvaluationInput> = {},
): CaseEvaluationInput {
  return baseInput({ caseId, caseRef, ...overrides });
}

function task(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    id: "t1",
    status: "PENDING",
    dueDate: "2026-09-25",
    assignedToId: "u1",
    isPreparationTask: false,
    blockedSince: null,
    ...overrides,
  };
}

describe("buildQueue — tie-breaker chain", () => {
  it("1. orders primarily by totalScore, descending", () => {
    const results = [result("a", 3), result("b", 9), result("c", 6)];
    const inputs = [input("a", "JG-A"), input("b", "JG-B"), input("c", "JG-C")];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["b", "c", "a"]);
  });

  it("2. tied score → earlier nextHearingDate ranks first, nulls last", () => {
    const results = [result("a", 5), result("b", 5), result("c", 5)];
    const inputs = [
      input("a", "JG-A", { nextHearingDate: null }),
      input("b", "JG-B", { nextHearingDate: "2026-10-01" }),
      input("c", "JG-C", { nextHearingDate: "2026-09-25" }),
    ];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["c", "b", "a"]);
  });

  it("3. tied score and hearing date → earliest open task due date ranks first, nulls last", () => {
    const results = [result("a", 5), result("b", 5), result("c", 5)];
    const inputs = [
      input("a", "JG-A", { nextHearingDate: "2026-10-01", tasks: [] }),
      input("b", "JG-B", {
        nextHearingDate: "2026-10-01",
        tasks: [task({ dueDate: "2026-09-22" })],
      }),
      input("c", "JG-C", {
        nextHearingDate: "2026-10-01",
        tasks: [task({ dueDate: "2026-09-20" })],
      }),
    ];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["c", "b", "a"]);
  });

  it("3b. only OPEN tasks count for the earliest-due-date tie-breaker", () => {
    const results = [result("a", 5), result("b", 5)];
    const inputs = [
      input("a", "JG-A", {
        nextHearingDate: "2026-10-01",
        tasks: [task({ dueDate: "2026-09-01", status: "COMPLETED" })],
      }),
      input("b", "JG-B", {
        nextHearingDate: "2026-10-01",
        tasks: [task({ dueDate: "2026-09-22", status: "PENDING" })],
      }),
    ];
    // "a"'s only task is COMPLETED (ignored) → treated as null → sorts after "b".
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["b", "a"]);
  });

  it("4. tied through step 3 → earlier custodyStartDate ranks first, nulls last", () => {
    const results = [result("a", 5), result("b", 5)];
    const inputs = [
      input("a", "JG-A", { nextHearingDate: null, tasks: [], custodyStartDate: "2026-05-01" }),
      input("b", "JG-B", { nextHearingDate: null, tasks: [], custodyStartDate: "2026-01-01" }),
    ];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["b", "a"]);
  });

  it("5. tied through every prior step → caseRef ASC breaks the tie", () => {
    const results = [result("a", 5), result("b", 5)];
    const inputs = [
      input("a", "JG-2026-0002", { nextHearingDate: null, tasks: [], custodyStartDate: null }),
      input("b", "JG-2026-0001", { nextHearingDate: null, tasks: [], custodyStartDate: null }),
    ];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["b", "a"]);
  });

  it("does not mutate the input arrays", () => {
    const results = [result("a", 3), result("b", 9)];
    const inputs = [input("a", "JG-A"), input("b", "JG-B")];
    const resultsCopy = [...results];
    buildQueue(results, inputs);
    expect(results).toEqual(resultsCopy);
  });

  it("throws a clear error if a result has no matching input", () => {
    const results = [result("missing", 5)];
    expect(() => buildQueue(results, [])).toThrow(/missing/);
  });
});

describe("buildQueue — total order property", () => {
  it("produces an identical order regardless of input shuffling, across 100 shuffles", () => {
    // A deliberately tie-heavy dataset: many share totalScore/hearing
    // date/custody date, so the property test actually exercises every
    // tie-breaker down to caseRef, not just tie-breaker 1.
    const cases = Array.from({ length: 12 }, (_, i) => {
      const caseId = `case-${i}`;
      const caseRef = `JG-2026-${String(i).padStart(4, "0")}`;
      return {
        result: result(caseId, i % 3 === 0 ? 8 : i % 3 === 1 ? 4 : 4),
        input: input(caseId, caseRef, {
          nextHearingDate: i % 2 === 0 ? "2026-10-01" : null,
          custodyStartDate: i % 4 === 0 ? "2026-01-01" : null,
          tasks: i % 5 === 0 ? [task({ dueDate: "2026-09-22" })] : [],
        }),
      };
    });

    const baselineOrder = buildQueue(
      cases.map((c) => c.result),
      cases.map((c) => c.input),
    ).map((r) => r.caseId);

    // Deterministic pseudo-random shuffle (mulberry32) — no Math.random,
    // so this test itself is reproducible across runs.
    function mulberry32(seed: number) {
      let a = seed;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    for (let trial = 0; trial < 100; trial++) {
      const rand = mulberry32(trial + 1);
      const shuffled = [...cases];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [
          shuffled[j] as (typeof shuffled)[number],
          shuffled[i] as (typeof shuffled)[number],
        ];
      }
      const order = buildQueue(
        shuffled.map((c) => c.result),
        shuffled.map((c) => c.input),
      ).map((r) => r.caseId);
      expect(order).toEqual(baselineOrder);
    }
  });

  it("two cases tied all the way through caseRef fall through the comparator's final equal case", () => {
    // caseRef is meant to be globally unique (spec §5's @unique
    // constraint), but the comparator must still be total even if it
    // isn't — this exercises that last fallback branch explicitly.
    const results = [result("a", 5), result("b", 5)];
    const inputs = [
      input("a", "JG-SAME", { nextHearingDate: null, tasks: [], custodyStartDate: null }),
      input("b", "JG-SAME", { nextHearingDate: null, tasks: [], custodyStartDate: null }),
    ];
    expect(buildQueue(results, inputs).map((r) => r.caseId)).toEqual(["a", "b"]);
  });
});
