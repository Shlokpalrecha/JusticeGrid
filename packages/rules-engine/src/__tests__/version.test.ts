import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../version.js";

describe("ENGINE_VERSION", () => {
  it("is a semver-shaped string (Phase 0 wiring smoke test)", () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
