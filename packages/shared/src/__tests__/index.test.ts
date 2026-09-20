import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_READY } from "../index.js";

describe("@justicegrid/shared wiring", () => {
  it("is wired into the workspace (Phase 0 smoke test)", () => {
    expect(SHARED_PACKAGE_READY).toBe(true);
  });
});
