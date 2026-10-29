import { beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedQueuePolicy,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";
import { evaluateAndPersistCase, toJson } from "../../lib/priorityEvaluation.js";
import { WorkflowFactsSchema, ActionCreateSchema } from "@justicegrid/shared";
import { DEFAULT_POLICY, canonicalJson } from "@justicegrid/rules-engine";
import * as queue from "../priority/priority.service.js";
import * as workflow from "./workflow.service.js";
import * as policy from "../queuePolicy/queuePolicy.service.js";
const context = { ipAddress: null, userAgent: null, requestId: "queue-test" };
describe("action queue end-to-end persistence", () => {
  beforeEach(resetDatabase);
  async function setup() {
    const admin = await createTestUser({ role: "ADMIN" }),
      lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" }),
      other = await createTestUser({ role: "LEGAL_PROFESSIONAL" }),
      auditor = await createTestUser({ role: "AUDITOR" });
    await seedQueuePolicy(admin.id);
    const c = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      custodyType: "NOT_IN_CUSTODY",
    });
    await prisma.case.update({
      where: { id: c.id },
      data: {
        workflowFacts: toJson(WorkflowFactsSchema.parse({ nextHearingState: "NOT_APPLICABLE" })),
      },
    });
    return { admin, lawyer, other, auditor, c };
  }
  async function add(
    actor: Awaited<ReturnType<typeof createTestUser>>,
    caseId: string,
    patch: Record<string, unknown> = {},
  ) {
    const body = ActionCreateSchema.parse({
      type: "A16",
      anchorReference: "synthetic-event",
      occurrenceId: crypto.randomUUID(),
      title: "Synthetic action",
      activatedAt: new Date(Date.now() - 86400000).toISOString(),
      origin: "TEAM_TARGET",
      confidence: "CONFIRMED",
      sourceId: "TEAM",
      locator: "Team review target",
      evidence: "Synthetic work",
      ownerId: actor.id,
      ...patch,
    });
    return workflow.createAction(actor, caseId, body, context);
  }
  it("persists a clock-only boundary and replays the exact recorded input", async () => {
    const { admin, c } = await setup();
    const now = new Date();
    await add(admin, c.id, { dueAt: new Date(now.getTime() + 8 * 86400000).toISOString() });
    const before = await prisma.$transaction((tx) =>
      evaluateAndPersistCase(tx, c.id, { triggeredBy: "SYSTEM", now }),
    );
    const after = await prisma.$transaction((tx) =>
      evaluateAndPersistCase(tx, c.id, {
        triggeredBy: "SYSTEM",
        now: new Date(now.getTime() + 2 * 86400000),
      }),
    );
    expect(before.priorityLevel).toBe("U3");
    expect(after.priorityLevel).toBe("U2");
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).currentPriorityLevel,
    ).toBe("U2");
    const history = await queue.getCasePriorityHistory(admin, c.id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect((await queue.replayEvaluation(admin, history[0]!.id)).matches).toBe(true);
  });
  it("does not append unchanged evaluations repeatedly", async () => {
    const { admin, c } = await setup();
    await add(admin, c.id);
    await queue.recomputeCase(admin, c.id, context);
    const n = await prisma.queueEvaluation.count();
    await queue.recomputeCase(admin, c.id, context);
    expect(await prisma.queueEvaluation.count()).toBe(n);
  });
  it("records recurrence as a new episode with a new notification", async () => {
    const { admin, c } = await setup();
    const f = WorkflowFactsSchema.parse({
      urgentReports: [
        {
          id: "report",
          kind: "MEDICAL",
          reportedAt: new Date().toISOString(),
          details: "Synthetic urgent report",
          confidence: "REPORTED",
        },
      ],
    });
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 0, facts: f, changeReason: "Recorded report" },
      context,
    );
    const first = await prisma.workflowAction.findFirstOrThrow({
      where: { caseId: c.id, type: "A01" },
    });
    const cleared = structuredClone(f);
    cleared.urgentReports[0]!.resolvedAt = new Date().toISOString();
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 1, facts: cleared, changeReason: "Referral outcome recorded" },
      context,
    );
    expect(
      (await prisma.workflowAction.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe("RESOLVED");
    f.urgentReports[0]!.reportedAt = new Date().toISOString();
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 2, facts: f, changeReason: "New reported need" },
      context,
    );
    expect(await prisma.workflowAction.count({ where: { caseId: c.id, type: "A01" } })).toBe(2);
  });
  it("blocks stale fact writes and preserves the audit chain", async () => {
    const { admin, c } = await setup();
    const body = {
      expectedRevision: 0,
      facts: WorkflowFactsSchema.parse({}),
      changeReason: "Verified record",
    };
    await workflow.updateWorkflow(admin, c.id, body, context);
    await expect(workflow.updateWorkflow(admin, c.id, body, context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await prisma.auditLog.count({ where: { entityId: c.id } })).toBe(1);
  });
  it("rejects impossible chronology and deletion of active referrals", async () => {
    const { admin, c } = await setup();
    const bad = WorkflowFactsSchema.parse({
      arrestAt: "2026-10-20T00:00:00Z",
      firstRemandAt: "2026-10-01T00:00:00Z",
    });
    await expect(
      workflow.updateWorkflow(
        admin,
        c.id,
        { expectedRevision: 0, facts: bad, changeReason: "bad" },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const f = WorkflowFactsSchema.parse({
      urgentReports: [
        {
          id: "r",
          kind: "SAFEGUARDING",
          reportedAt: "2026-10-01T00:00:00Z",
          details: "Synthetic report",
          confidence: "REPORTED",
        },
      ],
    });
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 0, facts: f, changeReason: "Report" },
      context,
    );
    f.urgentReports = [];
    await expect(
      workflow.updateWorkflow(
        admin,
        c.id,
        { expectedRevision: 1, facts: f, changeReason: "Delete" },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("requires a matching reviewed profile for a confirmed legal date", async () => {
    const { admin, c } = await setup();
    await expect(
      add(admin, c.id, {
        critical: true,
        origin: "STATUTE",
        sourceId: "S1",
        profileId: "missing",
        anchorAt: "2026-01-01T00:00:00Z",
        countingConvention: "Counsel confirmed",
        dueAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const p = await policy.createProfile(
      admin,
      {
        name: "Synthetic BNSS profile",
        version: 1,
        sourceId: "S1",
        locator: "Section reviewed",
        territory: "India-wide",
        procedure: "BNSS",
        effectiveFrom: "2024-07-01T00:00:00Z",
        verifiedAt: "2026-01-01T00:00:00Z",
        verificationNotes: "Synthetic applicability check",
        supersedesId: null,
      },
      context,
    );
    await prisma.case.update({
      where: { id: c.id },
      data: {
        workflowFacts: toJson(
          WorkflowFactsSchema.parse({
            procedure: "BNSS",
            procedureBasis: "Synthetic applicability confirmation",
            nextHearingState: "NOT_APPLICABLE",
          }),
        ),
      },
    });
    const a = await add(admin, c.id, {
      critical: true,
      origin: "STATUTE",
      sourceId: "S1",
      profileId: p.id,
      anchorAt: "2026-01-01T00:00:00Z",
      countingConvention: "Counsel confirmed",
      dueAt: new Date().toISOString(),
    });
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U0");
    await expect(
      workflow.overrideAction(
        admin,
        c.id,
        a.id,
        {
          expectedRevision: 0,
          urgency: "U3",
          reason: "Hide",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("acknowledgement cannot erase an underlying legal due date", async () => {
    const { admin, c } = await setup();
    const a = await add(admin, c.id, { dueAt: "2026-10-01T00:00:00Z" });
    await workflow.transitionAction(
      admin,
      c.id,
      a.id,
      {
        expectedRevision: 0,
        status: "ACKNOWLEDGED",
        evidence: "Acknowledged",
        nextReviewAt: new Date(Date.now() + 3600000).toISOString(),
      },
      context,
    );
    const row = await prisma.workflowAction.findUniqueOrThrow({ where: { id: a.id } });
    expect((row.payload as { dueAt: string }).dueAt).toBe("2026-10-01T00:00:00Z");
    expect(row.status).toBe("ACKNOWLEDGED");
  });
  it("keeps unresolved release work after closure and clears it only on release evidence", async () => {
    const { admin, c } = await setup();
    await prisma.case.update({
      where: { id: c.id },
      data: {
        caseStatus: "DISPOSED",
        workflowFacts: toJson(WorkflowFactsSchema.parse({ bailGrantedAt: "2026-10-01T00:00:00Z" })),
      },
    });
    const r = await queue.recomputeCase(admin, c.id, context);
    expect(r.included).toBe(true);
    expect(r.actions.some((a) => a.type === "A07")).toBe(true);
    await workflow.updateWorkflow(
      admin,
      c.id,
      {
        expectedRevision: 0,
        facts: WorkflowFactsSchema.parse({
          bailGrantedAt: "2026-10-01T00:00:00Z",
          releaseConfirmedAt: new Date().toISOString(),
        }),
        changeReason: "Actual release confirmed",
      },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).included).toBe(false);
  });
  it("scope filters cannot override lawyer ownership in queue or case list", async () => {
    const { admin, lawyer, other, c } = await setup();
    await add(admin, c.id);
    const token = await loginAs(createApp(), lawyer.email);
    const app = createApp();
    const own = await request(app)
      .get("/api/v1/priority/queue")
      .set("Authorization", `Bearer ${token}`);
    expect(own.body.data.length).toBe(1);
    for (const endpoint of ["/api/v1/priority/queue", "/api/v1/cases"]) {
      const res = await request(app)
        .get(endpoint)
        .query({ assignedTo: other.id })
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
    await expect(queue.getCasePriority(other, c.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("auditors cannot mutate workflows or policy; legacy routes are absent", async () => {
    const { auditor, c } = await setup();
    const app = createApp(),
      token = await loginAs(app, auditor.email);
    expect(
      (
        await request(app)
          .put(`/api/v1/workflows/case/${c.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/queue-policy/publish")
          .set("Authorization", `Bearer ${token}`)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/rules").set("Authorization", `Bearer ${token}`)).status,
    ).toBe(404);
  });
  it("simulates without writes, publishes one complete snapshot and rolls back as a new version", async () => {
    const { admin, lawyer, c } = await setup();
    await add(admin, c.id);
    const count = await prisma.queueEvaluation.count();
    const config = structuredClone(DEFAULT_POLICY);
    config.weights.blocker = 3;
    config.weights.ordinaryBlocker = 2;
    const sim = await policy.simulatePolicy(admin, config);
    expect(await prisma.queueEvaluation.count()).toBe(count);
    expect(sim.after.length).toBe(1);
    await expect(policy.simulatePolicy(lawyer, config)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await policy.publishPolicy(admin, config, 1, "Reviewed candidate", context);
    expect((await policy.getPolicy()).active.version).toBe(2);
    expect((await queue.getCasePriority(admin, c.id)).policyVersion).toBe(2);
    await expect(
      policy.publishPolicy(admin, config, 1, "Stale publication", context),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await policy.rollbackPolicy(admin, 1, 2, "Restore policy", context);
    expect((await policy.getPolicy()).active.version).toBe(3);
    expect(canonicalJson((await policy.getPolicy()).active.config)).toBe(
      canonicalJson(DEFAULT_POLICY),
    );
  });
  it("publishing rolls back atomically if one case cannot be evaluated", async () => {
    const { admin, c } = await setup();
    await prisma.case.update({
      where: { id: c.id },
      data: { workflowFacts: { representation: "INVALID" } },
    });
    await expect(
      policy.publishPolicy(admin, DEFAULT_POLICY, 1, "Candidate", context),
    ).rejects.toBeDefined();
    expect((await policy.getPolicy()).active.version).toBe(1);
    expect(await prisma.queuePolicy.count()).toBe(1);
  });
  it("preserves generated action activation and explicit ownership across refresh", async () => {
    const { admin, c } = await setup();
    const f = WorkflowFactsSchema.parse({ requestReceivedAt: "2026-10-01T00:00:00Z" });
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 0, facts: f, changeReason: "Request received" },
      context,
    );
    const first = await prisma.workflowAction.findFirstOrThrow({
      where: { caseId: c.id, type: "A02" },
    });
    const activation = (first.payload as { activatedAt: string }).activatedAt;
    await workflow.assignAction(
      admin,
      c.id,
      first.id,
      {
        expectedRevision: first.revision,
        ownerId: admin.id,
        reason: "Coordinator owns forwarding",
      },
      context,
    );
    await queue.recomputeCase(admin, c.id, context);
    const updated = await prisma.workflowAction.findUniqueOrThrow({ where: { id: first.id } });
    expect(updated.payload).toMatchObject({ ownerId: admin.id, activatedAt: activation });
    await expect(
      workflow.assignAction(
        admin,
        c.id,
        first.id,
        { expectedRevision: first.revision, ownerId: null, reason: "Stale" },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("marks confirmed dates invalid after material changes and prevents clearing the flag without reconfirmation", async () => {
    const { admin, c } = await setup();
    const profile = await policy.createProfile(
      admin,
      {
        name: "BNSS review",
        version: 1,
        sourceId: "S1",
        locator: "Reviewed section",
        territory: "India-wide",
        procedure: "BNSS",
        effectiveFrom: "2024-07-01T00:00:00Z",
        verifiedAt: "2026-01-01T00:00:00Z",
        verificationNotes: "Synthetic review",
        supersedesId: null,
      },
      context,
    );
    const f = WorkflowFactsSchema.parse({
      procedure: "BNSS",
      procedureBasis: "Reviewed applicability",
      legalProfileId: profile.id,
      confirmedReviews: [
        {
          id: "review",
          type: "A06",
          dueAt: new Date(Date.now() + 3600000).toISOString(),
          precision: "INSTANT",
          origin: "STATUTE",
          sourceId: "S1",
          locator: "479",
          basis: "Synthetic confirmed date",
          confirmedBy: "client cannot impersonate reviewer",
          confirmedAt: "2026-10-20T00:00:00Z",
          profileId: profile.id,
          assumptions: "Reviewed history",
          countingConvention: "Human-confirmed counting",
          anchorAt: "2026-10-01T00:00:00Z",
        },
      ],
    });
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 0, facts: f, changeReason: "Confirmed date" },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U0");
    f.priorConvictions = "TRUE";
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 1, facts: f, changeReason: "History corrected" },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U1");
    delete f.confirmedReviews[0]!.invalidatedReason;
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 2, facts: f, changeReason: "Attempt to clear warning" },
      context,
    );
    expect(
      (await workflow.getWorkflow(admin, c.id)).facts.confirmedReviews[0]?.invalidatedReason,
    ).toBeDefined();
    f.confirmedReviews[0]!.confirmedAt = new Date().toISOString();
    await workflow.updateWorkflow(
      admin,
      c.id,
      { expectedRevision: 3, facts: f, changeReason: "Human reconfirmation" },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U0");
  });
  it("serializes concurrent fact edits so exactly one expected revision wins", async () => {
    const { admin, c } = await setup();
    const body = {
      expectedRevision: 0,
      facts: WorkflowFactsSchema.parse({}),
      changeReason: "Concurrent correction",
    };
    const result = await Promise.allSettled([
      workflow.updateWorkflow(admin, c.id, structuredClone(body), context),
      workflow.updateWorkflow(admin, c.id, structuredClone(body), context),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).workflowRevision).toBe(1);
  });
  it("rejects resolving parents with active dependencies and reopening closed history", async () => {
    const { admin, c } = await setup();
    const parent = await add(admin, c.id);
    const row = await prisma.workflowAction.findUniqueOrThrow({ where: { id: parent.id } });
    const child = await add(admin, c.id, { parentKey: row.key });
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        parent.id,
        { expectedRevision: 0, status: "RESOLVED", evidence: "Premature", nextReviewAt: null },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await workflow.transitionAction(
      admin,
      c.id,
      child.id,
      {
        expectedRevision: 0,
        status: "RESOLVED",
        evidence: "Dependency complete",
        nextReviewAt: null,
      },
      context,
    );
    await workflow.transitionAction(
      admin,
      c.id,
      parent.id,
      { expectedRevision: 0, status: "RESOLVED", evidence: "Parent complete", nextReviewAt: null },
      context,
    );
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        parent.id,
        { expectedRevision: 1, status: "OPEN", evidence: "Reopen", nextReviewAt: null },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("retains last valid evaluation and exposes a stale error if scheduled evaluation fails", async () => {
    const { admin, c } = await setup();
    await add(admin, c.id);
    await prisma.case.update({
      where: { id: c.id },
      data: { workflowFacts: { representation: "INVALID" }, queueNextEvaluationAt: new Date(0) },
    });
    await queue.refreshScope(admin);
    const result = await queue.getCasePriority(admin, c.id);
    expect(result.stale).toBe(true);
    expect(result.error).toContain("Evaluation failed");
  });
  it("does not allow unreviewed profile mismatches or cross-case links", async () => {
    const { admin, c } = await setup();
    await expect(add(admin, c.id, { hearingId: "not-this-case" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(add(admin, c.id, { parentKey: "missing" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      add(admin, c.id, { activatedAt: new Date(Date.now() + 86400000).toISOString() }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const auditor = await createTestUser({ role: "AUDITOR" });
    await expect(add(admin, c.id, { ownerId: auditor.id })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("serves and mutates the complete workflow HTTP contract with revision checks", async () => {
    const { admin, c } = await setup(),
      app = createApp(),
      token = await loginAs(app, admin.email);
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).get("/api/v1/workflows/owners").set(auth)).status).toBe(200);
    expect(
      (await request(app).get(`/api/v1/workflows/case/${c.id}`).set(auth)).body.data.revision,
    ).toBe(0);
    expect(
      (
        await request(app)
          .put(`/api/v1/workflows/case/${c.id}`)
          .set(auth)
          .send({
            expectedRevision: 0,
            facts: WorkflowFactsSchema.parse({ nextHearingState: "NOT_APPLICABLE" }),
            changeReason: "HTTP evidence",
          })
      ).status,
    ).toBe(200);
    const created = await request(app)
      .post(`/api/v1/workflows/case/${c.id}/actions`)
      .set(auth)
      .send({
        type: "A16",
        anchorReference: "http",
        occurrenceId: "one",
        title: "HTTP action",
        activatedAt: new Date().toISOString(),
        origin: "TEAM_TARGET",
        confidence: "REPORTED",
        sourceId: "TEAM",
        locator: "Team target",
        evidence: "Synthetic HTTP scenario",
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(
      (
        await request(app)
          .post(`/api/v1/workflows/case/${c.id}/actions/${id}/assign`)
          .set(auth)
          .send({ expectedRevision: 0, ownerId: admin.id, reason: "HTTP ownership" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/v1/workflows/case/${c.id}/actions/${id}/override`)
          .set(auth)
          .send({
            expectedRevision: 1,
            urgency: "U1",
            reason: "Human review",
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/v1/workflows/case/${c.id}/actions/${id}`)
          .set(auth)
          .send({ expectedRevision: 2, status: "BLOCKED", evidence: "Awaiting response" })
      ).status,
    ).toBe(200);
    const evaluation = await queue.getCasePriority(admin, c.id);
    expect(evaluation.selectedAction?.status).toBe("BLOCKED");
    expect(
      (await request(app).get(`/api/v1/priority/evaluations/${evaluation.id}/replay`).set(auth))
        .body.data.matches,
    ).toBe(true);
  });
  it("serves policy publication, rollback and reviewed-profile HTTP routes", async () => {
    const { admin } = await setup(),
      app = createApp(),
      token = await loginAs(app, admin.email),
      auth = { Authorization: `Bearer ${token}` };
    expect(
      (await request(app).get("/api/v1/queue-policy").set(auth)).body.data.calculatorMode,
    ).toBe("CONFIRMED_DATES_ONLY");
    expect(
      (
        await request(app)
          .post("/api/v1/queue-policy/simulate")
          .set(auth)
          .send({ config: DEFAULT_POLICY })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).post("/api/v1/queue-policy/publish").set(auth).send({
          expectedVersion: 1,
          config: DEFAULT_POLICY,
          changeReason: "HTTP reviewed candidate",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/v1/queue-policy/rollback/1")
          .set(auth)
          .send({ expectedVersion: 2, changeReason: "HTTP rollback" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).post("/api/v1/queue-policy/profiles").set(auth).send({
          name: "HTTP profile",
          version: 1,
          sourceId: "S3",
          locator: "7",
          territory: "India-wide",
          procedure: "NATIONAL_PROCEDURE",
          effectiveFrom: "2022-01-01T00:00:00Z",
          verifiedAt: "2026-01-01T00:00:00Z",
          verificationNotes: "Synthetic reviewed example",
        })
      ).status,
    ).toBe(201);
  });
  it("rejects unsupported overrides and closed-owner edits without changing history", async () => {
    const { admin, lawyer, c } = await setup();
    const a = await add(admin, c.id);
    const future = new Date(Date.now() + 3600000).toISOString();
    await expect(
      workflow.overrideAction(
        lawyer,
        c.id,
        a.id,
        { expectedRevision: 0, urgency: "U1", reason: "No authority", expiresAt: future },
        context,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      workflow.overrideAction(
        admin,
        c.id,
        a.id,
        { expectedRevision: 0, urgency: "U0", reason: "Unsupported promotion", expiresAt: future },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      workflow.overrideAction(
        admin,
        c.id,
        a.id,
        {
          expectedRevision: 0,
          urgency: "U1",
          reason: "Expired",
          expiresAt: "2026-01-01T00:00:00Z",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      workflow.overrideAction(
        admin,
        c.id,
        "missing",
        { expectedRevision: 0, urgency: "U1", reason: "Missing", expiresAt: future },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      workflow.overrideAction(
        admin,
        c.id,
        a.id,
        { expectedRevision: 2, urgency: "U1", reason: "Stale", expiresAt: future },
        context,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await workflow.transitionAction(
      admin,
      c.id,
      a.id,
      {
        expectedRevision: 0,
        status: "CANCELLED",
        evidence: "Duplicate work corrected",
        nextReviewAt: null,
      },
      context,
    );
    await expect(
      workflow.assignAction(
        admin,
        c.id,
        a.id,
        { expectedRevision: 1, ownerId: admin.id, reason: "Closed" },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      workflow.assignAction(
        admin,
        c.id,
        "missing",
        { expectedRevision: 0, ownerId: null, reason: "Missing" },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("validates referral acknowledgement and prevents dismissing generated release work", async () => {
    const { admin, c } = await setup();
    await workflow.updateWorkflow(
      admin,
      c.id,
      {
        expectedRevision: 0,
        facts: WorkflowFactsSchema.parse({
          urgentReports: [
            {
              id: "urgent",
              kind: "MEDICAL",
              reportedAt: new Date().toISOString(),
              details: "Synthetic urgent need",
              confidence: "REPORTED",
            },
          ],
        }),
        changeReason: "Referral",
      },
      context,
    );
    const a = await prisma.workflowAction.findFirstOrThrow({
      where: { caseId: c.id, type: "A01" },
    });
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        a.id,
        { expectedRevision: 0, status: "ACKNOWLEDGED", evidence: "Contacted", nextReviewAt: null },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        a.id,
        {
          expectedRevision: 0,
          status: "ACKNOWLEDGED",
          evidence: "Contacted",
          nextReviewAt: "2026-01-01T00:00:00Z",
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await workflow.transitionAction(
      admin,
      c.id,
      a.id,
      {
        expectedRevision: 0,
        status: "ACKNOWLEDGED",
        evidence: "Response requested",
        nextReviewAt: new Date(Date.now() + 3600000).toISOString(),
      },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U1");
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        a.id,
        { expectedRevision: 1, status: "RESOLVED", evidence: "Hide", nextReviewAt: null },
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      workflow.transitionAction(
        admin,
        c.id,
        "missing",
        { expectedRevision: 0, status: "OPEN", evidence: "Missing", nextReviewAt: null },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("validates immutable applicability profile versions and unavailable policies", async () => {
    const { admin } = await setup();
    const p = {
      name: "Versioned profile",
      version: 1,
      sourceId: "S3",
      locator: "7",
      territory: "India-wide",
      procedure: "NATIONAL_PROCEDURE",
      effectiveFrom: "2022-01-01T00:00:00Z",
      verifiedAt: "2026-01-01T00:00:00Z",
      verificationNotes: "Synthetic reviewed example",
      supersedesId: null,
    };
    const first = await policy.createProfile(admin, p, context);
    await expect(policy.createProfile(admin, p, context)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await policy.createProfile(admin, { ...p, version: 2, supersedesId: first.id }, context);
    await expect(
      policy.createProfile(admin, { ...p, name: "Not a legal source", sourceId: "TEAM" }, context),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(policy.rollbackPolicy(admin, 999, 1, "Missing", context)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await prisma.queuePolicy.updateMany({ data: { isActive: false } });
    await expect(policy.getPolicy()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
  it("filters lanes, action categories and oldest work from one scoped ranking", async () => {
    const { admin, c } = await setup();
    await add(admin, c.id, { dueAt: new Date().toISOString() });
    expect(
      (await queue.getQueue(admin, { page: 1, pageSize: 20, lane: "OLDEST", actionType: "A16" }))
        .total,
    ).toBe(1);
    expect((await queue.getQueue(admin, { page: 1, pageSize: 20, lane: "REFERRAL" })).total).toBe(
      0,
    );
    expect(
      (await queue.getQueue(admin, { page: 1, pageSize: 20, lane: "LEGAL_DEADLINE" })).total,
    ).toBe(0);
    expect(
      (
        await queue.getQueue(admin, {
          page: 1,
          pageSize: 20,
          hearingFrom: "2026-01-01T00:00:00Z",
          hearingTo: "2026-12-31T00:00:00Z",
        })
      ).total,
    ).toBe(0);
  });
  it("uses the same deadline and activation tie-breaks in the case list and queue", async () => {
    const { admin, c } = await setup();
    const b = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyType: "NOT_IN_CUSTODY",
      caseRef: "ZZ-WAITING",
    });
    const planned = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyType: "NOT_IN_CUSTODY",
      caseRef: "ZZ-PLANNED",
    });
    await prisma.case.update({
      where: { id: b.id },
      data: {
        workflowFacts: toJson(WorkflowFactsSchema.parse({ nextHearingState: "NOT_APPLICABLE" })),
      },
    });
    await prisma.case.update({
      where: { id: planned.id },
      data: {
        workflowFacts: toJson(
          WorkflowFactsSchema.parse({
            nextHearingState: "NOT_APPLICABLE",
            nextPlannedReviewAt: new Date(Date.now() + 86400000).toISOString(),
          }),
        ),
      },
    });
    const dueAt = new Date(Date.now() + 10 * 86400000).toISOString();
    await add(admin, c.id, { dueAt });
    await add(admin, b.id, {
      dueAt,
      activatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    });
    const expected = (await queue.getQueue(admin, { page: 1, pageSize: 20 })).items.map(
      (x) => x.caseId,
    );
    expect(expected).toEqual([planned.id, b.id, c.id]);
    const app = createApp(),
      token = await loginAs(app, admin.email);
    const res = await request(app)
      .get("/api/v1/cases?sort=priority")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.map((x: { id: string }) => x.id)).toEqual(expected);
  });

  it("routes unowned critical follow-up to coordinators when its case owner becomes inactive", async () => {
    const { admin, lawyer, c } = await setup();
    await workflow.updateWorkflow(
      admin,
      c.id,
      {
        expectedRevision: 0,
        facts: WorkflowFactsSchema.parse({ requestReceivedAt: "2026-10-01T00:00:00Z" }),
        changeReason: "Synthetic request",
      },
      context,
    );
    await prisma.user.update({ where: { id: lawyer.id }, data: { isActive: false } });
    const r = await queue.recomputeCase(admin, c.id, context);
    expect(r.actions.find((a) => a.type === "A02")?.ownerId).toBeNull();
    expect(r.actions.some((a) => a.key === "ownership")).toBe(true);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBeGreaterThan(0);
  });
  it("corrects an acknowledgement consistently in both source facts and queue urgency", async () => {
    const { admin, c } = await setup();
    await workflow.updateWorkflow(
      admin,
      c.id,
      {
        expectedRevision: 0,
        facts: WorkflowFactsSchema.parse({
          urgentReports: [
            {
              id: "correctable",
              kind: "SAFEGUARDING",
              reportedAt: new Date().toISOString(),
              details: "Synthetic referral",
              confidence: "REPORTED",
            },
          ],
        }),
        changeReason: "Referral",
      },
      context,
    );
    const a = await prisma.workflowAction.findFirstOrThrow({
      where: { caseId: c.id, type: "A01" },
    });
    await workflow.transitionAction(
      admin,
      c.id,
      a.id,
      {
        expectedRevision: 0,
        status: "ACKNOWLEDGED",
        evidence: "Response recorded",
        nextReviewAt: new Date(Date.now() + 3600000).toISOString(),
      },
      context,
    );
    expect(
      (await workflow.getWorkflow(admin, c.id)).facts.urgentReports[0]?.acknowledgedAt,
    ).toBeTruthy();
    await workflow.transitionAction(
      admin,
      c.id,
      a.id,
      {
        expectedRevision: 1,
        status: "OPEN",
        evidence: "Acknowledgement corrected: response still awaited",
        nextReviewAt: null,
      },
      context,
    );
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U0");
    expect(
      (await workflow.getWorkflow(admin, c.id)).facts.urgentReports[0]?.acknowledgedAt,
    ).toBeNull();
  });
  it("records a case-order direction using its own source reference rather than a statute citation", async () => {
    const { admin, c } = await setup();
    const profile = await policy.createProfile(
      admin,
      {
        name: "Synthetic court-order intake profile",
        version: 1,
        sourceId: "CASE_ORDER",
        locator: "Verify current order reference for each recorded direction",
        territory: "India-wide",
        procedure: "NATIONAL_PROCEDURE",
        effectiveFrom: "2022-01-01T00:00:00Z",
        verifiedAt: "2026-01-01T00:00:00Z",
        verificationNotes:
          "Synthetic intake method only; individual directions require human confirmation",
        supersedesId: null,
      },
      context,
    );
    await add(admin, c.id, {
      type: "A12",
      origin: "COURT_ORDER",
      sourceId: "CASE_ORDER",
      profileId: profile.id,
      critical: true,
      dueAt: new Date().toISOString(),
      anchorAt: "2026-10-01T00:00:00Z",
      countingConvention: "Exact time stated in fictional order",
      locator: "Fictional case order, paragraph 3",
      evidence: "Human-confirmed synthetic direction",
    });
    expect((await queue.getCasePriority(admin, c.id)).priorityLevel).toBe("U0");
  });

  it("reserves the oldest-work view for real unresolved work and uses the oldest action", async () => {
    const { admin, c } = await setup();
    const b = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyType: "NOT_IN_CUSTODY",
    });
    await prisma.case.update({
      where: { id: b.id },
      data: {
        workflowFacts: toJson(WorkflowFactsSchema.parse({ nextHearingState: "NOT_APPLICABLE" })),
      },
    });
    await add(admin, c.id, {
      activatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    await add(admin, c.id, {
      activatedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await add(admin, b.id, { dueAt: new Date(Date.now() + 2 * 86400000).toISOString() });
    expect(
      (await queue.getQueue(admin, { page: 1, pageSize: 20, lane: "OLDEST" })).items.map(
        (x) => x.caseId,
      ),
    ).toEqual([c.id, b.id]);
  });
 it("refuses to claim an exact replay with a different engine version",async()=>{
  const {admin,c}=await setup();await add(admin,c.id);const row=await prisma.queueEvaluation.findFirstOrThrow({where:{caseId:c.id}});const result={...(row.result as Record<string,unknown>),engineVersion:"experimental-old-version"};const old=await prisma.queueEvaluation.create({data:{caseId:c.id,policyVersion:row.policyVersion,inputSnapshot:row.inputSnapshot as never,policySnapshot:row.policySnapshot as never,result:toJson(result),outcomeHash:row.outcomeHash,evaluatedAt:new Date(0),triggeredBy:"SYSTEM"}});await expect(queue.replayEvaluation(admin,old.id)).rejects.toMatchObject({code:"VALIDATION_ERROR"});
 });

});
