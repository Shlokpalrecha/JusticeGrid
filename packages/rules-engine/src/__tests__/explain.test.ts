import { describe, expect, it } from "vitest";
import { buildExplanation, renderReasonText } from "../explain.js";
import type { TriggeredReasonResult } from "../types.js";
import { baseConfig } from "./fixtures.js";

describe("renderReasonText", () => {
  it("substitutes matching evidence keys", () => {
    const text = renderReasonText("Hearing is within {days} days ({nextHearingDate})", {
      days: 3,
      nextHearingDate: "2026-10-12",
    });
    expect(text).toBe("Hearing is within 3 days (2026-10-12)");
  });

  it("renders boolean and null evidence values sensibly", () => {
    expect(renderReasonText("Reviewed: {orderReviewed}", { orderReviewed: false })).toBe(
      "Reviewed: false",
    );
    expect(renderReasonText("Value: {v}", { v: null })).toBe("Value: none");
  });

  it("JSON-stringifies object/array evidence values rather than '[object Object]'", () => {
    expect(renderReasonText("Missing: {missingFields}", { missingFields: ["a", "b"] })).toBe(
      'Missing: ["a","b"]',
    );
  });

  it("leaves an unmatched placeholder as literal text instead of throwing", () => {
    expect(renderReasonText("Value: {unknownKey}", {})).toBe("Value: {unknownKey}");
  });

  it("leaves a template with no placeholders untouched", () => {
    expect(renderReasonText("No time-sensitive workflow condition triggered", {})).toBe(
      "No time-sensitive workflow condition triggered",
    );
  });
});

function reason(
  points: number,
  overrides: Partial<TriggeredReasonResult> = {},
): TriggeredReasonResult {
  return {
    ruleId: "r1",
    ruleCode: "R-TEST",
    ruleName: "Test",
    category: "HEARING",
    points,
    reasonText: "test",
    evidence: {},
    orderIndex: 0,
    ...overrides,
  };
}

describe("buildExplanation", () => {
  it("matches the spec's worked example exactly: 4 + 4 + 3 = 11 → HIGH (≥ 7)", () => {
    const reasons = [reason(4), reason(4), reason(3)];
    const explanation = buildExplanation(reasons, 11, 11, "HIGH", baseConfig());
    expect(explanation).toBe("4 + 4 + 3 = 11 → HIGH (≥ 7)");
  });

  it("returns the fixed no-reasons message when nothing triggered (spec §10 Case B)", () => {
    expect(buildExplanation([], 0, 0, "ROUTINE", baseConfig())).toBe(
      "No time-sensitive workflow condition triggered",
    );
  });

  it("shows the MEDIUM threshold arithmetic", () => {
    const reasons = [reason(2), reason(2)];
    expect(buildExplanation(reasons, 4, 4, "MEDIUM", baseConfig())).toBe(
      "2 + 2 = 4 → MEDIUM (≥ 3)",
    );
  });

  it("shows the ROUTINE-with-some-points arithmetic", () => {
    const reasons = [reason(1)];
    expect(buildExplanation(reasons, 1, 1, "ROUTINE", baseConfig())).toBe("1 = 1 → ROUTINE (< 3)");
  });

  it("notes when the score was capped", () => {
    const reasons = [reason(4), reason(4), reason(4)];
    const config = baseConfig({ maxScoreCap: 10 });
    expect(buildExplanation(reasons, 12, 10, "HIGH", config)).toBe(
      "4 + 4 + 4 = 12 (capped to 10) → HIGH (≥ 7)",
    );
  });
});
