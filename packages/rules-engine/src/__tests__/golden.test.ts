import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCase } from "../evaluate.js";
import { GOLDEN_NOW, GOLDEN_SCENARIOS } from "./golden/scenarios.js";

/**
 * Golden snapshot tests (spec §11). Each committed JSON file under
 * __tests__/golden/ is the frozen expected output of evaluateCase() for
 * one scenario in scenarios.ts. A change to scoring, condition logic,
 * hashing, ordering, or explanation text shows up as a diff in one of
 * these files in code review — even if no other single unit test
 * happens to exercise that exact combination.
 *
 * To regenerate after a deliberate behaviour change: evaluate each
 * scenario from golden/scenarios.ts with GOLDEN_NOW, and overwrite its
 * JSON file with `JSON.stringify(result, null, 2) + "\n"`. Never
 * regenerate to make a failing test pass without first confirming the
 * new output is actually correct — that defeats the point of a golden
 * test.
 */

const goldenDir = join(dirname(fileURLToPath(import.meta.url)), "golden");

describe("golden snapshots", () => {
  it.each(GOLDEN_SCENARIOS)("$name matches its committed golden output", (scenario) => {
    const actual = evaluateCase(scenario.input, scenario.rules, scenario.config, GOLDEN_NOW);
    const expectedRaw = readFileSync(join(goldenDir, `${scenario.name}.json`), "utf8");
    const expected: unknown = JSON.parse(expectedRaw);
    expect(actual).toEqual(expected);
  });

  it("running a scenario twice reproduces its golden output exactly (determinism)", () => {
    const scenario = GOLDEN_SCENARIOS[0];
    if (!scenario) throw new Error("expected at least one golden scenario");
    const first = evaluateCase(scenario.input, scenario.rules, scenario.config, GOLDEN_NOW);
    const second = evaluateCase(scenario.input, scenario.rules, scenario.config, GOLDEN_NOW);
    expect(second).toEqual(first);
  });
});
