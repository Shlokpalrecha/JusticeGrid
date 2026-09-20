import { describe, expect, it } from "vitest";
import { canonicalJson, computeInputHash, sha256Hex } from "../hash.js";
import type { CaseEvaluationInput, RuleDefinition, RulesetConfig } from "../types.js";
import { baseInput, baseRule } from "./fixtures.js";

describe("sha256Hex", () => {
  // Known-answer tests (NIST/RFC test vectors) — verifies the from-scratch
  // implementation against the standard, not just against itself.
  it("matches the published SHA-256 digest of the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it('matches the published SHA-256 digest of "abc"', () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the published digest for a two-block (>55 byte) message", () => {
    // FIPS 180-4 / NIST test vector: forces the padding logic to span two
    // 512-bit blocks, exercising a path the short vectors above don't.
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("is deterministic: identical input always yields identical output", () => {
    expect(sha256Hex("justicegrid")).toBe(sha256Hex("justicegrid"));
  });

  it("produces different digests for different input", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });

  it("returns a 64-character lowercase hex string", () => {
    expect(sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("canonicalJson", () => {
  it("sorts object keys recursively regardless of insertion order", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array element order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts keys inside objects nested in arrays", () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("handles null and primitive values", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("x")).toBe('"x"');
  });
});

describe("computeInputHash", () => {
  const input: CaseEvaluationInput = baseInput();
  const rules: RuleDefinition[] = [baseRule()];
  const config: RulesetConfig = { version: 1, highThreshold: 7, mediumThreshold: 3 };

  it("is deterministic for identical input", () => {
    expect(computeInputHash(input, rules, config)).toBe(computeInputHash(input, rules, config));
  });

  it("changes when the input changes", () => {
    const hashA = computeInputHash(input, rules, config);
    const hashB = computeInputHash({ ...input, caseId: "different-case" }, rules, config);
    expect(hashA).not.toBe(hashB);
  });

  it("changes when the ruleset changes", () => {
    const hashA = computeInputHash(input, rules, config);
    const hashB = computeInputHash(input, [{ ...baseRule(), weight: 999 }], config);
    expect(hashA).not.toBe(hashB);
  });

  it("changes when the config changes", () => {
    const hashA = computeInputHash(input, rules, config);
    const hashB = computeInputHash(input, rules, { ...config, highThreshold: 9 });
    expect(hashA).not.toBe(hashB);
  });

  it("is unaffected by object key insertion order in the input (canonical JSON)", () => {
    const reordered: CaseEvaluationInput = {
      requiredFieldsPresent: input.requiredFieldsPresent,
      caseId: input.caseId,
      caseRef: input.caseRef,
      assignedToId: input.assignedToId,
      caseStatus: input.caseStatus,
      custodyType: input.custodyType,
      custodyStartDate: input.custodyStartDate,
      nextHearingDate: input.nextHearingDate,
      lastHearingDate: input.lastHearingDate,
      lastActivityAt: input.lastActivityAt,
      bailStatus: input.bailStatus,
      bailAppliedDate: input.bailAppliedDate,
      consecutiveAdjournments: input.consecutiveAdjournments,
      lastHearing: input.lastHearing,
      tasks: input.tasks,
      documents: input.documents,
    };
    expect(computeInputHash(input, rules, config)).toBe(computeInputHash(reordered, rules, config));
  });
});
