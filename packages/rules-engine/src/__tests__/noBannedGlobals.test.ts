import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Belt-and-suspenders enforcement of spec §6.2's determinism guardrail,
 * independent of the ESLint config: greps every non-test source file in
 * this package for `Date.now()`, a zero-argument `new Date()`, and
 * `Math.random()`. ESLint (root eslint.config.mjs) is the primary
 * enforcement mechanism and runs on every commit/CI run; this test is
 * the second, harder-to-bypass check spec §6.2 explicitly asks for
 * ("a unit test that greps the source"), since it runs wherever the
 * test suite runs, not only wherever lint happens to be configured.
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...listSourceFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const BANNED_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Date.now()", pattern: /\bDate\s*\.\s*now\s*\(/ },
  // Zero-arg `new Date()` — allow `new Date(x)` with any argument.
  { name: "new Date() with no argument", pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { name: "Math.random()", pattern: /\bMath\s*\.\s*random\s*\(/ },
];

describe("no banned non-deterministic globals in the engine source", () => {
  const files = listSourceFiles(srcDir);

  it("found source files to scan (sanity check the scan itself isn't vacuous)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [f] as const))("%s contains no banned pattern", (file) => {
    const contents = readFileSync(file, "utf8");
    for (const { name, pattern } of BANNED_PATTERNS) {
      expect(pattern.test(contents), `${file} contains banned pattern: ${name}`).toBe(false);
    }
  });

  it("legitimate `new Date(x)` with an argument is not flagged by the pattern itself", () => {
    // date.ts and evaluate.ts both do this deliberately (date.ts §6.2
    // day-math, evaluate.ts reading the injected `now`) — proves the
    // regex above doesn't over-match and silently make this test vacuous.
    expect(BANNED_PATTERNS[1]?.pattern.test("new Date(instant.getTime() + 1000)")).toBe(false);
    expect(BANNED_PATTERNS[1]?.pattern.test("new Date()")).toBe(true);
  });
});
