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
// every case built for these tests is given a recent custodyStartDate
// (keeping R-CUSTODY-LONG, whose default 180-day threshold would
// otherwise silently add 1 point once "now" drifts far enough past
// dbHelpers' fixed 2026-01-01 default, out of the arithmetic) and must
// be explicitly evaluated — either via `recomputeTestCase` or by a
// subsequent real mutation (charge/hearing/assign) that triggers one
// itself.
const RECENT_CUSTODY_START = new Date(Date.now() - 30 * 86400000);

describe("priority — queue, case detail, history, recompute, distribution", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  /**
   * Builds three cases with deliberately distinct, deterministic
   * evaluations against the spec §6.6 default ruleset (thresholds 7/3):
   *  - caseA: bare (unassigned, no charges, no hearing) → R-NO-ASSIGNEE
   *    (2) + R-CASE-INCOMPLETE (2) + R-NO-HEARING-DATE (3) = 7 (HIGH).
   *    Explicitly recomputed since nothing else mutates it after
   *    creation.
   *  - caseB: assigned, has a charge, no hearing → only
   *    R-NO-HEARING-DATE (3) = 3 (MEDIUM). Evaluated as a side effect of
   *    the `POST /cases/:id/charges` call below (spec §6.7).
   *  - caseC: assigned, has a charge, has a hearing 30 days out (outside
   *    every HEARING_WITHIN_DAYS window) → no rules trigger = 0
   *    (ROUTINE). Evaluated as a side effect of the hearing creation
   *    (which runs after, and therefore supersedes, the charge's
   *    evaluation).
   */
  async function buildThreeCases(admin: { id: string }, lawyer: { id: string }, token: string) {
    const caseA = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    await recomputeTestCase(app, token, caseA.id);

    const caseB = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    await request(app)
      .post(`/api/v1/cases/${caseB.id}/charges`)
      .set("Authorization", `Bearer ${token}`)
      .send({ actName: "IPC", sectionCode: "302", isBailableFlag: false, severityBand: "SEVERE" });

    const caseC = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    await request(app)
      .post(`/api/v1/cases/${caseC.id}/charges`)
      .set("Authorization", `Bearer ${token}`)
      .send({ actName: "IPC", sectionCode: "302", isBailableFlag: false, severityBand: "SEVERE" });
    // Recomputing the case's nextHearingDate (lib/caseHearingDates.ts)
    // happens automatically inside the create-hearing transaction, which
    // also triggers a priority recompute (spec §6.7) — so no separate
    // recompute call is needed for caseC.
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
    await request(app)
      .post(`/api/v1/cases/${caseC.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: futureDate, hearingType: "EVIDENCE" });

    return { caseA, caseB, caseC };
  }

  it("GET /priority/queue orders cases by totalScore DESC", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    const { caseA, caseB, caseC } = await buildThreeCases(admin, lawyer, token);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { caseId: string }) => r.caseId)).toEqual([
      caseA.id,
      caseB.id,
      caseC.id,
    ]);
    expect(res.body.data[0].evaluation.totalScore).toBe(7);
    expect(res.body.data[0].evaluation.priorityLevel).toBe("HIGH");
    expect(res.body.data[0].rank).toBe(1);
    expect(res.body.data[2].evaluation.totalScore).toBe(0);
    expect(res.body.data[2].evaluation.priorityLevel).toBe("ROUTINE");
  });

  it("GET /priority/queue paginates", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    await buildThreeCases(admin, lawyer, token);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].rank).toBe(3);
    expect(res.body.meta.total).toBe(3);
  });

  it("GET /priority/queue filters by priority band", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    const { caseA } = await buildThreeCases(admin, lawyer, token);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .query({ priority: "HIGH" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].caseId).toBe(caseA.id);
  });

  it("GET /priority/queue filters by assignedTo", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    const { caseB, caseC } = await buildThreeCases(admin, lawyer, token);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .query({ assignedTo: lawyer.id })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { caseId: string }) => r.caseId).sort()).toEqual(
      [caseB.id, caseC.id].sort(),
    );
  });

  it("GET /priority/queue filters by ruleCode", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    const { caseA } = await buildThreeCases(admin, lawyer, token);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .query({ ruleCode: "R-NO-ASSIGNEE" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].caseId).toBe(caseA.id);
  });

  it("GET /priority/queue filters by hearing date range", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, admin.email);
    const { caseC } = await buildThreeCases(admin, lawyer, token);

    const from = new Date(Date.now() + 20 * 86400000).toISOString();
    const to = new Date(Date.now() + 40 * 86400000).toISOString();

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .query({ hearingFrom: from, hearingTo: to })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].caseId).toBe(caseC.id);
  });

  it("a LEGAL_PROFESSIONAL's queue is scoped to their own assigned cases (spec §8.4)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const adminToken = await loginAs(app, admin.email);
    const { caseB, caseC } = await buildThreeCases(admin, lawyer, adminToken);
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .get("/api/v1/priority/queue")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { caseId: string }) => r.caseId).sort()).toEqual(
      [caseB.id, caseC.id].sort(),
    );
  });

  it("GET /priority/case/:caseId returns the current evaluation with a human-readable explanation", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    const res = await request(app)
      .get(`/api/v1/priority/case/${caseRow.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.priorityLevel).toBe("MEDIUM");
    expect(typeof res.body.data.explanation).toBe("string");
    expect(res.body.data.explanation.length).toBeGreaterThan(0);
    expect(res.body.data.reasons.length).toBeGreaterThan(0);
  });

  it("a LEGAL_PROFESSIONAL gets 403 reading another user's case priority (IDOR)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });
    const token = await loginAs(app, attacker.email);

    const res = await request(app)
      .get(`/api/v1/priority/case/${caseRow.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("GET /priority/case/:caseId/history returns every evaluation, newest first", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    // Force a second, genuinely different evaluation by assigning the
    // case (clears R-NO-ASSIGNEE).
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: lawyer.id, reason: "test" });

    const res = await request(app)
      .get(`/api/v1/priority/case/${caseRow.id}/history`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(new Date(res.body.data[0].evaluatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.data[1].evaluatedAt).getTime(),
    );
  });

  /**
   * spec §6.7's documented idempotency optimisation: recomputing with no
   * change to input or ruleset writes NO new PriorityEvaluation row,
   * only bumps `lastEvaluatedAt`.
   */
  it("POST /priority/case/:caseId/recompute is idempotent when nothing changed", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    const before = await prisma.priorityEvaluation.findFirstOrThrow({
      where: { caseId: caseRow.id },
    });

    const res = await request(app)
      .post(`/api/v1/priority/case/${caseRow.id}/recompute`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(before.id);

    const count = await prisma.priorityEvaluation.count({ where: { caseId: caseRow.id } });
    expect(count).toBe(1);

    const caseAfter = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(caseAfter.lastEvaluatedAt).not.toBeNull();
    expect(caseAfter.lastEvaluatedAt!.getTime()).toBeGreaterThanOrEqual(
      before.evaluatedAt.getTime(),
    );

    const recomputeAudit = await prisma.auditLog.findFirst({
      where: { action: "PRIORITY_RECOMPUTE", entityId: caseRow.id },
    });
    expect(recomputeAudit).not.toBeNull();
  });

  it("POST /priority/case/:caseId/recompute writes a new evaluation once the input actually changes", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const caseRow = await createTestCase({
      createdById: admin.id,
      custodyStartDate: RECENT_CUSTODY_START,
    });
    const token = await loginAs(app, admin.email);
    await recomputeTestCase(app, token, caseRow.id);

    await prisma.charge.create({
      data: {
        caseId: caseRow.id,
        actName: "IPC",
        sectionCode: "302",
        description: "x",
        isBailableFlag: false,
        severityBand: "SEVERE",
      },
    });

    const res = await request(app)
      .post(`/api/v1/priority/case/${caseRow.id}/recompute`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const count = await prisma.priorityEvaluation.count({ where: { caseId: caseRow.id } });
    expect(count).toBe(2);
  });

  it("GET /priority/distribution counts cases per band, scoped by role", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedDefaultRuleset(admin.id);
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const adminToken = await loginAs(app, admin.email);
    await buildThreeCases(admin, lawyer, adminToken);

    const adminRes = await request(app)
      .get("/api/v1/priority/distribution")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data).toEqual({ ROUTINE: 1, MEDIUM: 1, HIGH: 1 });

    const lawyerToken = await loginAs(app, lawyer.email);
    const lawyerRes = await request(app)
      .get("/api/v1/priority/distribution")
      .set("Authorization", `Bearer ${lawyerToken}`);

    expect(lawyerRes.status).toBe(200);
    // Only caseB (MEDIUM) and caseC (ROUTINE) are assigned to the lawyer.
    expect(lawyerRes.body.data).toEqual({ ROUTINE: 1, MEDIUM: 1, HIGH: 0 });
  });
});
