import { describe, expect, it } from "vitest";
import {
  ERROR_CODE_HTTP_STATUS,
  ERROR_CODE_VALUES,
  PersonCreateInputSchema,
  RoleSchema,
  RBAC_MATRIX,
  hasCapability,
  hasUnscopedCapability,
  UserSchema,
  apiSuccessSchema,
} from "../index.js";

describe("enums", () => {
  it("RoleSchema accepts the three defined roles and rejects anything else", () => {
    expect(RoleSchema.safeParse("ADMIN").success).toBe(true);
    expect(RoleSchema.safeParse("LEGAL_PROFESSIONAL").success).toBe(true);
    expect(RoleSchema.safeParse("AUDITOR").success).toBe(true);
    expect(RoleSchema.safeParse("SUPERADMIN").success).toBe(false);
  });
});

describe("Person guardrail (spec §1.5 / §5)", () => {
  it("accepts a synthetic person with isSynthetic omitted (defaults true)", () => {
    const result = PersonCreateInputSchema.safeParse({
      aliasCode: "UT-0001",
      displayName: "Test Person",
      ageBand: "18-25",
      gender: "X",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isSynthetic).toBe(true);
    }
  });

  it("accepts isSynthetic: true explicitly", () => {
    const result = PersonCreateInputSchema.safeParse({
      aliasCode: "UT-0002",
      displayName: "Test Person",
      ageBand: "18-25",
      gender: "X",
      isSynthetic: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects isSynthetic: false — the guardrail must reject non-synthetic writes", () => {
    const result = PersonCreateInputSchema.safeParse({
      aliasCode: "UT-0003",
      displayName: "Real Person",
      ageBand: "18-25",
      gender: "X",
      isSynthetic: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("error codes (spec §7)", () => {
  it("has one HTTP status mapped per error code, no gaps", () => {
    for (const code of ERROR_CODE_VALUES) {
      expect(ERROR_CODE_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("success envelope", () => {
  it("wraps arbitrary data schemas", () => {
    const schema = apiSuccessSchema(UserSchema.pick({ id: true, email: true }));
    const result = schema.safeParse({
      success: true,
      data: { id: "u1", email: "a@b.test" },
      meta: { requestId: "req-1" },
    });
    expect(result.success).toBe(true);
  });
});

describe("RBAC matrix (spec §8.3)", () => {
  it("gives ADMIN unconditional access to every capability", () => {
    for (const capability of Object.keys(RBAC_MATRIX.ADMIN) as (keyof typeof RBAC_MATRIX.ADMIN)[]) {
      expect(hasUnscopedCapability("ADMIN", capability)).toBe(true);
    }
  });

  it("restricts LEGAL_PROFESSIONAL from assigning cases or managing users", () => {
    expect(hasCapability("LEGAL_PROFESSIONAL", "ASSIGN_CASE")).toBe(false);
    expect(hasCapability("LEGAL_PROFESSIONAL", "MANAGE_USERS")).toBe(false);
  });

  it("scopes LEGAL_PROFESSIONAL's case visibility rather than granting it outright", () => {
    expect(hasCapability("LEGAL_PROFESSIONAL", "VIEW_ANY_CASE")).toBe(true);
    expect(hasUnscopedCapability("LEGAL_PROFESSIONAL", "VIEW_ANY_CASE")).toBe(false);
  });

  it("gives AUDITOR read access to cases and audit but no write capability", () => {
    expect(hasCapability("AUDITOR", "VIEW_ANY_CASE")).toBe(true);
    expect(hasCapability("AUDITOR", "VIEW_AUDIT_LOG")).toBe(true);
    expect(hasCapability("AUDITOR", "CREATE_EDIT_CASE")).toBe(false);
    expect(hasCapability("AUDITOR", "RECORD_CASE_ACTIVITY")).toBe(false);
  });
});
