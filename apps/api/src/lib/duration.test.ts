import { describe, expect, it } from "vitest";
import { parseDurationMs } from "./duration.js";

describe("parseDurationMs", () => {
  it("parses seconds/minutes/hours/days", () => {
    expect(parseDurationMs("30s")).toBe(30 * 1000);
    expect(parseDurationMs("15m")).toBe(15 * 60 * 1000);
    expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDurationMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("throws a clear error for an unparseable string", () => {
    expect(() => parseDurationMs("15 minutes")).toThrow(/Invalid duration/);
    expect(() => parseDurationMs("15")).toThrow(/Invalid duration/);
    expect(() => parseDurationMs("15w")).toThrow(/Invalid duration/);
  });
});
