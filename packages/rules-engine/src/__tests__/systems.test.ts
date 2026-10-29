import { input, action, NOW } from "./fixtures.js";
import { describe, it, expect } from "vitest";
import {
  evaluateCase,
  DEFAULT_POLICY,
  compileExpression,
  evaluateExpression,
  compileRules,
  runRules,
  analyzeDag,
  GraphError,
  IdentityIndex,
  soundex,
  boundedLevenshtein,
  SharedPriorityHeap,
  HeapConflict,
} from "../index.js";
describe("systems invariants", () => {
  it("parses precedence, typed math and UNKNOWN without executing input", () => {
    const fields = { Age: "number", Bail_Eligibility: "boolean", Name: "string" } as const;
    for (const [source, result] of [
      ["Age > 65 AND NOT Bail_Eligibility", null],
      ["Age > 65 OR Bail_Eligibility", true],
      ["(Age + 2) / 2 >= FLOOR(67 / 2)", true],
      ["Name = 'Fictional' AND TRUE", true],
    ] as const)
      expect(
        evaluateExpression(compileExpression(source, fields), {
          Age: 66,
          Bail_Eligibility: null,
          Name: "Fictional",
        }),
      ).toBe(result);
    for (const source of [
      "Age >",
      "Age = '65'",
      "process.exit()",
      "Age.__proto__",
      "NOT Age",
      "TRUE; DROP TABLE Case",
      "BOGUS(Age)",
    ])
      expect(() => compileExpression(source, fields)).toThrow();
    expect(evaluateExpression(compileExpression("1 / 0", {}, "number"), {})).toBeNull();
    for (const source of [
      "1 + 2 = 3",
      "5 - 2 == 3",
      "2 * 3 != 7",
      "6 / 2 < 4",
      "4 > 3",
      "3 >= 3",
      "3 <= 3",
      "ABS(-3) = MAX(2,3)",
      "+3 = 3",
      "MIN(1,2) = 1",
      "NOT FALSE",
      "!FALSE",
      "FALSE OR TRUE",
      "TRUE AND TRUE",
      "FALSE AND Bail_Eligibility",
      "Bail_Eligibility AND FALSE",
      "TRUE OR Bail_Eligibility",
      "Bail_Eligibility OR TRUE",
    ])
      expect(evaluateExpression(compileExpression(source, fields), {})).toBe(
        source.includes("AND FALSE") || source.startsWith("FALSE AND") ? false : true,
      );
    for (const source of [
      "",
      "'unterminated",
      "'bad\\n'",
      "MIN(1)",
      "MIN(1,2,3)",
      "(TRUE",
      "Age TRUE",
      "Age AND TRUE",
      "TRUE < FALSE",
      "Age",
      "TRUE + FALSE",
      "9".repeat(400) + " > 0",
      "NOT ".repeat(60) + "TRUE",
      "1+".repeat(600) + "1=1",
      "TRUE ".repeat(1800),
    ])
      expect(() => compileExpression(source, fields)).toThrow();
    expect(evaluateExpression(compileExpression("NOT Bail_Eligibility", fields), {})).toBeNull();
    expect(
      evaluateExpression(compileExpression("ABS(Age)", fields, "number"), { Age: null }),
    ).toBeNull();
    expect(evaluateExpression(compileExpression("Age > 0", fields), { Age: Infinity })).toBeNull();
    expect(
      evaluateExpression(compileExpression("1" + "0".repeat(308) + " * 10", {}, "number"), {}),
    ).toBeNull();
  });
  it("compiles rule dependencies and rejects a cyclic runtime program", () => {
    const program = compileRules([
      { id: "evidence", when: "Statutory_Deadline_Days < 3", urgency: "U1" },
      {
        id: "prepare",
        when: "rule_evidence AND NOT Bail_Eligibility",
        dependsOn: ["evidence"],
        component: "D",
        value: "4",
      },
    ]);
    expect(
      runRules(program, { Statutory_Deadline_Days: 2, Bail_Eligibility: false }),
    ).toMatchObject({ urgency: "U1", components: { D: 4 } });
    expect(() =>
      compileRules([
        { id: "a", when: "TRUE", urgency: "U1", dependsOn: ["b"] },
        { id: "b", when: "TRUE", urgency: "U1", dependsOn: ["a"] },
      ]),
    ).toThrow(GraphError);
    for (const definitions of [
      [],
      Array.from({ length: 129 }, (_, i) => ({
        id: "r" + i,
        when: "TRUE",
        urgency: "U1" as const,
      })),
      [{ id: "BAD", when: "TRUE", urgency: "U1" as const }],
      [{ id: "empty", when: "TRUE" }],
      [{ id: "missing", when: "TRUE", component: "D" as const }],
      [{ id: "extra", when: "TRUE", value: "1", urgency: "U1" as const }],
      [
        { id: "a", when: "TRUE", urgency: "U1" as const },
        { id: "b", when: "rule_a", urgency: "U1" as const },
      ],
    ])
      expect(() => compileRules(definitions)).toThrow();
    expect(
      runRules(program, { Statutory_Deadline_Days: null, Bail_Eligibility: null }).trace.map(
        (t) => t.result,
      ),
    ).toEqual([null, false]);
    const capped = compileRules([
      { id: "cap", when: "TRUE", component: "D", value: "100" },
      { id: "negative", when: "TRUE", component: "H", value: "-2" },
      { id: "unknown", when: "TRUE", component: "F", value: "1/0" },
      { id: "also", when: "TRUE", urgency: "U3" },
    ]);
    expect(runRules(capped, {}).components).toEqual({ H: 0, A: 0, B: 0, D: 4, F: 0 });
    for (let i = 0; i < 33; i++) compileRules([{ id: "cached" + i, when: "TRUE", urgency: "U3" }]);
  });
  it("unlocks an AND join only after every prerequisite and identifies cycle paths", () => {
    const nodes = ["Evidence_Discovery", "Pre_Trial_Motion_Hearing", "Trial_Docketing"],
      edges = [
        { from: nodes[0]!, to: nodes[2]! },
        { from: nodes[1]!, to: nodes[2]! },
      ];
    expect(analyzeDag(nodes, edges, new Set([nodes[0]!])).ready).toEqual([nodes[1]]);
    expect(analyzeDag(nodes, edges, new Set(nodes.slice(0, 2))).ready).toEqual([nodes[2]]);
    expect(() => analyzeDag(nodes, [...edges, { from: nodes[2]!, to: nodes[0]! }])).toThrow(
      /Cycle/,
    );
    expect(() => analyzeDag(["a", "a"], [])).toThrow(/Duplicate/);
    expect(() => analyzeDag(["a"], [{ from: "a", to: "b" }])).toThrow(/Unknown/);
    expect(analyzeDag(nodes, [...edges, ...edges]).order).toEqual(nodes);
    const workflowGraph = {
      nodes: nodes.map((key) => ({
        key,
        title: key,
        status: "OPEN" as const,
        readyAt: NOW.toISOString(),
      })),
      edges,
    };
    const i = input({
      workflowGraph,
      ruleFacts: { offenseSeverityIndex: 3, bailEligibility: false },
    });
    expect(
      evaluateCase(i, DEFAULT_POLICY, NOW)
        .actions.filter((a) => a.key.startsWith("dag:"))
        .map((a) => a.key),
    ).toEqual(expect.arrayContaining(["dag:Evidence_Discovery", "dag:Pre_Trial_Motion_Hearing"]));
    expect(
      evaluateCase(
        input({
          workflowGraph: {
            ...workflowGraph,
            nodes: [{ key: "entry", title: "Entry", status: "OPEN" }],
          },
          isArchived: true,
        }),
        DEFAULT_POLICY,
        NOW,
      ).included,
    ).toBe(false);
    expect(
      evaluateCase(
        input({
          workflowGraph: { nodes: [{ key: "entry", title: "Entry", status: "OPEN" }], edges: [] },
        }),
        DEFAULT_POLICY,
        NOW,
      ).actions.some((a) => a.key === "dag:entry"),
    ).toBe(true);
    expect(() =>
      evaluateCase(
        input({
          actions: [
            action({ key: "a", parentKey: "b" }),
            action({ id: "b", key: "b", parentKey: "a" }),
          ],
        }),
        DEFAULT_POLICY,
        NOW,
      ),
    ).toThrow(GraphError);
  });
  it("routes inverted names and exact evidence IDs in bounded candidate blocks", () => {
    expect(soundex("Robert")).toBe(soundex("Rupert"));
    expect(boundedLevenshtein("RAHUL", "RAHUL", 2)).toBe(0);
    expect(boundedLevenshtein("RAHUL", "RAHULX", 2)).toBe(1);
    for (const [a, b, k, result] of [
      ["", "", 0, 0],
      ["", "abc", 3, 3],
      ["abc", "", 3, 3],
      ["a", "long", 1, 2],
      ["abc", "xyz", 1, 2],
      ["abcdef", "abqdef", 1, 1],
      ["abc", "abc", 0, 0],
    ] as const)
      expect(boundedLevenshtein(a, b, k)).toBe(result);
    expect(() => boundedLevenshtein("a", "b", 9)).toThrow();
    expect(soundex("अजय")).toMatch(/^U:/);
    expect(soundex("Ashcraft")).toBe("A261");
    const index = new IdentityIndex(10, 2),
      record = {
        id: "a",
        kind: "FILING",
        name: "Rahul Sharma",
        jurisdiction: "A",
        reference: "EVID-1",
        eventDate: null,
      };
    index.upsert(record);
    expect(
      index.match({ ...record, id: "", name: "Sharma Rahul", jurisdiction: "B" }).matches[0]
        ?.distance,
    ).toBe(0);
    expect(
      index.match({ ...record, id: "", name: "Different Person" }).matches[0]?.sameReference,
    ).toBe(true);
    index.upsert({ ...record, id: "b" });
    index.upsert({ ...record, id: "c" });
    expect(index.match({ ...record, id: "" }).overflow).toBe(true);
    index.remove("a");
    expect(index.stats().records).toBe(2);
    index.remove("absent");
    const tiny = new IdentityIndex(1);
    tiny.upsert({ ...record, eventDate: "2026-10-29" });
    tiny.upsert({ ...record, name: "Changed" });
    expect(() => tiny.upsert({ ...record, id: "b" })).toThrow();
    tiny.remove("a");
    expect(tiny.stats()).toMatchObject({ records: 0, blocks: 0, postings: 0 });
    expect(tiny.match(record).status).toBe("NO_CANDIDATE");
  });
  it("maintains indexed heap order on updates/removals and rejects stale OCC", () => {
    const heap = new SharedPriorityHeap(8);
    for (let id = 0; id < 8; id++) heap.upsert({ id, keys: [7 - id, 0, 0, 0, 0, 0] });
    expect(heap.pop()?.id).toBe(7);
    heap.upsert({ id: 0, keys: [-1, 0, 0, 0, 0, 0] });
    expect(heap.pop()?.id).toBe(0);
    heap.remove(2);
    expect(heap.ordered().rows.map((r) => r.id)).toEqual([6, 5, 4, 3, 1]);
    expect(() => heap.upsert({ id: 1, keys: [0, 0, 0, 0, 0, 0] }, 0)).toThrow(HeapConflict);
    const attached = new SharedPriorityHeap(8, heap.buffer);
    expect(attached.revision).toBe(heap.revision);
    attached.replace([{ id: 1, keys: [1, 0, 0, 0, 0, 0] }], attached.revision);
    expect(attached.pop()?.id).toBe(1);
    expect(attached.pop()).toBeNull();
    expect(attached.remove(7)).toBeNull();
    expect(() => attached.replace([], 0)).toThrow(HeapConflict);
    expect(() => attached.remove(1, 0)).toThrow(HeapConflict);
    expect(() => attached.remove(-1)).toThrow();
    expect(() => attached.upsert({ id: 8, keys: [1, 0, 0, 0, 0, 0] })).toThrow();
    expect(() => new SharedPriorityHeap(0)).toThrow();
    expect(() => new SharedPriorityHeap(1, heap.buffer)).toThrow();
    Atomics.store(new Int32Array(heap.buffer), 0, 1);
    expect(() => attached.snapshot()).toThrow(HeapConflict);
    Atomics.store(new Int32Array(heap.buffer), 0, 0);
  });
});
