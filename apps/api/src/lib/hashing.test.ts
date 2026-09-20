import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./hashing.js";

describe("hashPassword / verifyPassword", () => {
  it("hashes with the spec-mandated Argon2id parameters (m=19456,t=2,p=1)", async () => {
    const hash = await hashPassword("Correct@12345");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("verifies the correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("Correct@12345");
    expect(await verifyPassword(hash, "Correct@12345")).toBe(true);
    expect(await verifyPassword(hash, "Wrong@12345")).toBe(false);
  });

  it("produces a different hash for the same password on each call (random salt)", async () => {
    const a = await hashPassword("SamePassword@1");
    const b = await hashPassword("SamePassword@1");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "SamePassword@1")).toBe(true);
    expect(await verifyPassword(b, "SamePassword@1")).toBe(true);
  });
});
