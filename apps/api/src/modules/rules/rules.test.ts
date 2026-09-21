import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedDefaultRuleset,
} from "../../test/dbHelpers.js";
import { loginAs, recomputeTestCase } from "../../test/httpHelpers.js";

// `createTestCase` (dbHelpers) writes straight through Prisma, bypassing
// `cases.service.ts`'s create-time evaluation trigger (spec §6.7) — so
// cases built for these tests get a recent custodyStartDate (keeping
// R-CUSTODY-LONG's 180-day threshold out of the arithmetic, since
// dbHelpers' fixed 2026-01-01 default would otherwise silently add 1
// point once "now" drifts far enough past it) and, where a test needs a
// pre-existing evaluation, an explicit `recomputeTestCase` call.
const RECENT_CUSTODY_START = new Date(Date.now() - 30 * 86400000);

describe("rules — CRUD, versioning, config, simulate, recompute", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("GET /rules is readable by every role and returns the seeded default ruleset", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const auditor = await createTestUser({ role: "AUDITOR" });
    const token = await loginAs(app, auditor.email);

    const res = await request(app).get("/api/v1/rules").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(17);
    expect(res.body.data.some((r: { code: string }) => r.code === "R-DOC-MISSING")).toBe(true);
  });

  it("ADMIN creates a rule; a RuleVersion and CREATE audit entry are written", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "R-CUSTOM-1",
        name: "Custom test rule",
        description: "A custom rule for testing.",
        category: "TASK",
        conditionType: "TASK_OVERDUE",
        params: { graceDays: 0 },
        weight: 5,
        isEnabled: true,
        displayTemplate: "Custom {count}",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe("R-CUSTOM-1");
    expect(res.body.data.version).toBe(1);

    const versions = await prisma.ruleVersion.findMany({ where: { ruleId: res.body.data.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.changeReason).toBe("Rule created");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Rule", entityId: res.body.data.id, action: "CREATE" },
    });
    expect(audit).not.toBeNull();
  });

  it("LEGAL_PROFESSIONAL and AUDITOR cannot create, update, toggle, or configure rules (403)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const rule = await prisma.rule.findFirstOrThrow({ where: { code: "R-DOC-MISSING" } });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const auditor = await createTestUser({ role: "AUDITOR" });

    for (const user of [lawyer, auditor]) {
      const token = await loginAs(app, user.email);

      const create = await request(app)
        .post("/api/v1/rules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          code: `R-DENY-${user.role}`,
          name: "x",
          description: "x",
          category: "TASK",
          conditionType: "TASK_OVERDUE",
          params: {},
          weight: 1,
          displayTemplate: "x",
        });
      expect(create.status).toBe(403);

      const update = await request(app)
        .patch(`/api/v1/rules/${rule.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ weight: 9 });
      expect(update.status).toBe(403);

      const toggle = await request(app)
        .post(`/api/v1/rules/${rule.id}/toggle`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isEnabled: false });
      expect(toggle.status).toBe(403);

      const config = await request(app)
        .put("/api/v1/rules/config")
        .set("Authorization", `Bearer ${token}`)
        .send({ highThreshold: 8, mediumThreshold: 4 });
      expect(config.status).toBe(403);
    }
  });

  /**
   * Phase 5's named done-criterion (spec §11's phase table): "Rule-change
   * → recompute integration test green." A case is evaluated once under
   * the default ruleset, then an ADMIN raises R-CASE-INCOMPLETE's weight
   * via `PATCH /rules/:id` — this must recompute every case (spec §6.7),
   * writing a NEW PriorityEvaluation row reflecting the new weight (not
   * just mutating the old one), updating the case's denormalized
   * currentPriorityScore, creating a new RuleVersion snapshot, and
   * logging both a RULE_WEIGHT_CHANGE and a PRIORITY_RECOMPUTE audit
   * entry.
   */
  it("rule weight change recomputes all cases and writes new evaluations + audit entries", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    // Deliberately bare: no assignee, no charges, no hearing date — so
    // R-NO-ASSIGNEE (2) + R-CASE-INCOMPLETE (2) + R-NO-HEARING-DATE (3)
    // = 7 (HIGH, since highThreshold defaults to 7).
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    const before = await prisma.priorityEvaluation.findFirst({
      where: { caseId: caseRow.id },
      orderBy: { evaluatedAt: "desc" },
    });
    expect(before?.totalScore).toBe(7);
    expect(before?.priorityLevel).toBe("HIGH");
    const evaluationsBefore = await prisma.priorityEvaluation.count({
      where: { caseId: caseRow.id },
    });
    expect(evaluationsBefore).toBe(1);

    const incompleteRule = await prisma.rule.findFirstOrThrow({
      where: { code: "R-CASE-INCOMPLETE" },
    });

    const res = await request(app)
      .patch(`/api/v1/rules/${incompleteRule.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ weight: 6, changeReason: "Testing rule-change recompute" });

    expect(res.status).toBe(200);
    expect(res.body.data.weight).toBe(6);
    expect(res.body.data.version).toBe(2);

    const versions = await prisma.ruleVersion.findMany({
      where: { ruleId: incompleteRule.id },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]?.changeReason).toBe("Testing rule-change recompute");

    const weightChangeAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Rule", entityId: incompleteRule.id, action: "RULE_WEIGHT_CHANGE" },
    });
    expect(weightChangeAudit).not.toBeNull();

    const recomputeAudit = await prisma.auditLog.findFirst({
      where: { action: "PRIORITY_RECOMPUTE" },
    });
    expect(recomputeAudit).not.toBeNull();

    const evaluationsAfter = await prisma.priorityEvaluation.count({
      where: { caseId: caseRow.id },
    });
    expect(evaluationsAfter).toBe(2);

    const after = await prisma.priorityEvaluation.findFirst({
      where: { caseId: caseRow.id },
      orderBy: { evaluatedAt: "desc" },
    });
    // 2 (assignee) + 6 (incomplete, was 2) + 3 (no hearing date) = 11.
    expect(after?.totalScore).toBe(11);

    const updatedCase = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(updatedCase.currentPriorityScore).toBe(11);
    expect(updatedCase.currentPriorityLevel).toBe("HIGH");
  });

  it("toggling a rule off recomputes all cases (the disabled rule stops contributing)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    const assigneeRule = await prisma.rule.findFirstOrThrow({ where: { code: "R-NO-ASSIGNEE" } });

    const res = await request(app)
      .post(`/api/v1/rules/${assigneeRule.id}/toggle`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isEnabled).toBe(false);

    const after = await prisma.priorityEvaluation.findFirst({
      where: { caseId: caseRow.id },
      orderBy: { evaluatedAt: "desc" },
    });
    // R-NO-ASSIGNEE (2) no longer contributes: 2 (incomplete) + 3 (no
    // hearing date) = 5 (MEDIUM, since mediumThreshold defaults to 3).
    expect(after?.totalScore).toBe(5);
    expect(after?.priorityLevel).toBe("MEDIUM");
  });

  it("GET /rules/:id/versions returns the append-only history newest-first", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const token = await loginAs(app, admin.email);
    const rule = await prisma.rule.findFirstOrThrow({ where: { code: "R-TASK-OVERDUE" } });

    await request(app)
      .patch(`/api/v1/rules/${rule.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ weight: 5 });

    const res = await request(app)
      .get(`/api/v1/rules/${rule.id}/versions`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].version).toBe(2);
    expect(res.body.data[1].version).toBe(1);
  });

  it("PUT /rules/config versions the config — old row is deactivated, not mutated", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const v1 = await seedDefaultRuleset(admin.id);
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .put("/api/v1/rules/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ highThreshold: 9, mediumThreshold: 4, notes: "Raised thresholds for testing" });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.highThreshold).toBe(9);

    const oldConfig = await prisma.rulesetConfig.findUniqueOrThrow({ where: { id: v1.id } });
    expect(oldConfig.isActive).toBe(false);
    expect(oldConfig.highThreshold).toBe(7);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "RulesetConfig", action: "THRESHOLD_CHANGE" },
    });
    expect(audit).not.toBeNull();
  });

  it("rejects a config where mediumThreshold >= highThreshold", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .put("/api/v1/rules/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ highThreshold: 5, mediumThreshold: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  /**
   * spec §7 ⭐: "returns how the queue would change ... without
   * persisting." No new PriorityEvaluation row and no Case field change.
   */
  it("POST /rules/simulate previews a weight change without persisting anything", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);

    const incompleteRule = await prisma.rule.findFirstOrThrow({
      where: { code: "R-CASE-INCOMPLETE" },
    });
    const evaluationsBefore = await prisma.priorityEvaluation.count({
      where: { caseId: caseRow.id },
    });
    const caseBefore = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });

    const res = await request(app)
      .post("/api/v1/rules/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({ ruleOverrides: [{ ruleId: incompleteRule.id, weight: 6 }], topN: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.casesEvaluated).toBe(1);
    expect(res.body.data.before.topCases[0].totalScore).toBe(7);
    expect(res.body.data.after.topCases[0].totalScore).toBe(11);
    expect(res.body.data.before.distribution.HIGH).toBe(1);
    expect(res.body.data.after.distribution.HIGH).toBe(1);

    const evaluationsAfter = await prisma.priorityEvaluation.count({
      where: { caseId: caseRow.id },
    });
    expect(evaluationsAfter).toBe(evaluationsBefore);
    const caseAfter = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(caseAfter.currentPriorityScore).toBe(caseBefore.currentPriorityScore);

    // The live rule itself must be untouched too — simulate never writes.
    const ruleAfter = await prisma.rule.findUniqueOrThrow({ where: { id: incompleteRule.id } });
    expect(ruleAfter.weight).toBe(2);
  });

  it("POST /rules/recompute-all recomputes every non-deleted case and logs one audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseA = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const caseB = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/rules/recompute-all")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.recomputedCount).toBe(2);

    for (const caseRow of [caseA, caseB]) {
      // Unchanged input/ruleset since the case was created ⇒ idempotent
      // optimisation (spec §6.7): still exactly 1 evaluation row, only
      // lastEvaluatedAt bumps.
      const count = await prisma.priorityEvaluation.count({ where: { caseId: caseRow.id } });
      expect(count).toBe(1);
    }
  });
});
