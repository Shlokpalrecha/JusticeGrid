import { describe, expect, it } from "vitest";
import { computeScore } from "../score.js";
import { baseConfig } from "./fixtures.js";

describe("computeScore", () => {
  it("sums the given points as rawScore, equal to totalScore with no cap", () => {
    const result = computeScore([4, 4, 3], baseConfig());
    expect(result.rawScore).toBe(11);
    expect(result.totalScore).toBe(11);
  });

  it("is ROUTINE when nothing triggered", () => {
    const result = computeScore([], baseConfig());
    expect(result).toEqual({ rawScore: 0, totalScore: 0, priorityLevel: "ROUTINE" });
  });

  it("boundary: ROUTINE→MEDIUM at the mediumThreshold (default 3)", () => {
    expect(computeScore([2], baseConfig()).priorityLevel).toBe("ROUTINE");
    expect(computeScore([3], baseConfig()).priorityLevel).toBe("MEDIUM");
  });

  it("boundary: MEDIUM→HIGH at the highThreshold (default 7)", () => {
    expect(computeScore([6], baseConfig()).priorityLevel).toBe("MEDIUM");
    expect(computeScore([7], baseConfig()).priorityLevel).toBe("HIGH");
  });

  it("respects custom thresholds", () => {
    const config = baseConfig({ mediumThreshold: 5, highThreshold: 10 });
    expect(computeScore([4], config).priorityLevel).toBe("ROUTINE");
    expect(computeScore([5], config).priorityLevel).toBe("MEDIUM");
    expect(computeScore([9], config).priorityLevel).toBe("MEDIUM");
    expect(computeScore([10], config).priorityLevel).toBe("HIGH");
  });

  it("caps totalScore at maxScoreCap without affecting rawScore", () => {
    const config = baseConfig({ maxScoreCap: 10 });
    const result = computeScore([4, 4, 4, 4], config); // raw = 16
    expect(result.rawScore).toBe(16);
    expect(result.totalScore).toBe(10);
    expect(result.priorityLevel).toBe("HIGH");
  });

  it("boundary: cap exactly equal to rawScore does not change totalScore", () => {
    const config = baseConfig({ maxScoreCap: 11 });
    const result = computeScore([4, 4, 3], config);
    expect(result.totalScore).toBe(11);
  });

  it("cap is evaluated against totalScore for banding, not rawScore", () => {
    // rawScore 20 would be HIGH either way, but this proves banding uses
    // the capped value: cap it down into MEDIUM territory explicitly.
    const config = baseConfig({ maxScoreCap: 5, mediumThreshold: 3, highThreshold: 7 });
    const result = computeScore([20], config);
    expect(result.rawScore).toBe(20);
    expect(result.totalScore).toBe(5);
    expect(result.priorityLevel).toBe("MEDIUM");
  });

  it("no maxScoreCap set at all leaves totalScore uncapped for a very high rawScore", () => {
    const result = computeScore([4, 4, 4, 3, 3, 2, 2, 1], baseConfig());
    expect(result.rawScore).toBe(23);
    expect(result.totalScore).toBe(23);
    expect(result.priorityLevel).toBe("HIGH");
  });
});
