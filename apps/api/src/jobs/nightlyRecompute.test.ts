import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedDefaultRuleset,
} from "../test/dbHelpers.js";
import { runNightlyRecompute } from "./nightlyRecompute.js";

describe("nightly recompute job (spec §6.7 / §13)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("recomputes every non-deleted case as a system actor and logs a PRIORITY_RECOMPUTE audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseA = await createTestCase({ createdById: admin.id });
    const caseB = await createTestCase({ createdById: admin.id });

    await runNightlyRecompute();

    for (const caseRow of [caseA, caseB]) {
      const evaluation = await prisma.priorityEvaluation.findFirst({
        where: { caseId: caseRow.id },
      });
      expect(evaluation).not.toBeNull();
      expect(evaluation?.triggeredBy).toBe("SCHEDULED");
      expect(evaluation?.triggeredById).toBeNull();
    }

    const audit = await prisma.auditLog.findFirst({ where: { action: "PRIORITY_RECOMPUTE" } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBeNull();
    expect(audit?.actorEmail).toBe("system@justicegrid.internal");
  });

  it("does not throw when recomputation fails (e.g. no active RulesetConfig) — a nightly cron process must never crash", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    // Deliberately no seedDefaultRuleset: evaluateAndPersistCase throws
    // for lack of an active RulesetConfig, and runNightlyRecompute must
    // swallow that (log it) rather than let it escape uncaught.
    await createTestCase({ createdById: admin.id });

    await expect(runNightlyRecompute()).resolves.toBeUndefined();
  });
});
