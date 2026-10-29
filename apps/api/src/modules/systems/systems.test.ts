import { beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  resetDatabase,
  createTestUser,
  createTestCase,
  seedQueuePolicy,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";
import { verifyActivityLedger } from "../../lib/audit.js";
import { DEFAULT_POLICY, DEFAULT_TEXT_RULES } from "@justicegrid/rules-engine";
const configuration = {
  nodes: [
    { key: "Evidence_Discovery", title: "Evidence discovery" },
    { key: "Pre_Trial_Motion_Hearing", title: "Pre-trial motion hearing" },
    { key: "Trial_Docketing", title: "Trial docketing" },
  ],
  edges: [
    { from: "Evidence_Discovery", to: "Trial_Docketing" },
    { from: "Pre_Trial_Motion_Hearing", to: "Trial_Docketing" },
  ],
};
describe("integrated deterministic systems", () => {
  beforeEach(resetDatabase);
  async function setup() {
    const admin = await createTestUser({ role: "ADMIN" });
    await seedQueuePolicy(admin.id);
    const c = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyType: "NOT_IN_CUSTODY",
    });
    const app = createApp(),
      token = await loginAs(app, admin.email);
    return { app, admin, c, auth: { Authorization: `Bearer ${token}` } };
  }
  it("streams candidates through the index and preserves link/split history", async () => {
    const { app, auth } = await setup();
    const record = {
      kind: "FILING",
      name: "Rahul Sharma",
      jurisdiction: "Synthetic A",
      reference: "SYN-E1",
    };
    const a = await request(app)
      .post("/api/v1/systems/identity/ingest")
      .set(auth)
      .send({ records: [record], reason: "Synthetic intake" });
    expect(a.status).toBe(201);
    const first = a.body.data.results[0].record;
    const b = await request(app)
      .post("/api/v1/systems/identity/ingest")
      .set(auth)
      .send({
        records: [{ ...record, name: "Sharma Rahul", jurisdiction: "Synthetic B" }],
        reason: "Second jurisdiction",
      });
    expect(b.status).toBe(201);
    expect(b.body.data.results[0].candidates.matches[0].id).toBe(first.id);
    const second = b.body.data.results[0].record;
    const body = {
      leftId: first.id,
      rightId: second.id,
      expectedRevision: -1,
      disposition: "LINK",
      reason: "Human-reviewed synthetic identity",
    };
    expect(
      (await request(app).post("/api/v1/systems/identity/decisions").set(auth).send(body)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/v1/systems/identity/decisions")
          .set(auth)
          .send({
            ...body,
            expectedRevision: 0,
            disposition: "SPLIT",
            reason: "Corrected identity evidence",
          })
      ).status,
    ).toBe(200);
    expect(await prisma.systemRecord.count()).toBe(2);
    expect((await verifyActivityLedger(prisma)).intact).toBe(true);
  });
  it("rejects cycles, blocks incomplete joins, and serializes conflicting transitions", async () => {
    const { app, auth, c } = await setup(),
      url = "/api/v1/systems/graphs/case/" + c.id;
    expect(
      (
        await request(app)
          .put(url)
          .set(auth)
          .send({ ...configuration, expectedRevision: -1, reason: "Create Track 4 pipeline" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .put(url)
          .set(auth)
          .send({
            ...configuration,
            edges: [...configuration.edges, { from: "Trial_Docketing", to: "Evidence_Discovery" }],
            expectedRevision: 0,
            reason: "Illegal cycle",
          })
      ).body.error.code,
    ).toBe("CYCLE_DETECTED");
    expect(
      (
        await request(app)
          .patch(url + "/nodes/Trial_Docketing")
          .set(auth)
          .send({ expectedRevision: 0, status: "DONE", evidence: "Premature" })
      ).body.error.code,
    ).toBe("DEPENDENCY_BLOCKED");
    const edits = await Promise.all(
      ["Evidence_Discovery", "Pre_Trial_Motion_Hearing"].map((key) =>
        request(app)
          .patch(url + "/nodes/" + key)
          .set(auth)
          .send({
            expectedRevision: 0,
            status: "DONE",
            evidence: "Concurrent synthetic completion",
          }),
      ),
    );
    expect(edits.map((r) => r.status).sort()).toEqual([200, 409]);
    let graph = (await request(app).get(url).set(auth)).body.data;
    const remaining = graph.nodes.find(
      (n: { status: string; key: string }) =>
        n.status === "OPEN" && Boolean(graph.analysis.ready.includes(n.key)),
    );
    expect(remaining).toBeDefined();
    expect(
      (
        await request(app)
          .patch(url + "/nodes/" + remaining.key)
          .set(auth)
          .send({
            expectedRevision: graph.revision,
            status: "DONE",
            evidence: "Other prerequisite complete",
          })
      ).status,
    ).toBe(200);
    graph = (await request(app).get(url).set(auth)).body.data;
    expect(graph.analysis.ready).toEqual(["Trial_Docketing"]);
    const queue = await request(app)
      .get("/api/v1/priority/case/" + c.id)
      .set(auth);
    expect(
      queue.body.data.actions.some((a: { key: string }) => a.key === "dag:Trial_Docketing"),
    ).toBe(true);
    expect(await prisma.activityLedger.count({ where: { entityType: "SystemRejection" } })).toBe(3);
    expect((await verifyActivityLedger(prisma)).intact).toBe(true);
  });
  it("publishes normalized text rules that affect the actual queue and survive rollback", async () => {
    const { app, auth, c } = await setup();
    const rules = [
      ...DEFAULT_TEXT_RULES,
      { id: "custom_review", when: 'Type = "A16"', urgency: "U1" },
    ];
    const publish = await request(app)
      .post("/api/v1/queue-policy/publish")
      .set(auth)
      .send({
        expectedVersion: 1,
        config: { ...DEFAULT_POLICY, textRules: rules },
        changeReason: "Runtime program",
      });
    expect(publish.status).toBe(200);
    expect(await prisma.runtimeTextRule.count()).toBe(rules.length);
    const action = await request(app)
      .post(`/api/v1/workflows/case/${c.id}/actions`)
      .set(auth)
      .send({
        type: "A16",
        anchorReference: "systems",
        occurrenceId: "one",
        title: "Synthetic custom review",
        activatedAt: new Date().toISOString(),
        origin: "TEAM_TARGET",
        confidence: "CONFIRMED",
        sourceId: "TEAM",
        locator: "Team target",
        evidence: "Synthetic",
        ownerId: (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })).id,
      });
    expect(action.status).toBe(201);
    const q = await request(app).get("/api/v1/priority/queue").set(auth);
    expect(q.status).toBe(200);
    expect(
      q.body.data[0].evaluation.actions
        .find((a: { title: string }) => a.title === "Synthetic custom review")
        .ruleTrace.some(
          (r: { id: string; result: boolean }) => r.id === "custom_review" && r.result,
        ),
    ).toBe(true);
    expect(
      (
        await request(app)
          .post("/api/v1/queue-policy/rollback/1")
          .set(auth)
          .send({ expectedVersion: 2, changeReason: "Restore baseline" })
      ).status,
    ).toBe(200);
  });
  it("enforces DB ledger immutability and rejects malformed AST input without executing it", async () => {
    const { app, auth } = await setup();
    expect(
      (
        await request(app)
          .post("/api/v1/systems/rules/compile")
          .set(auth)
          .send({ expression: "process.exit()" })
      ).body.error.code,
    ).toBe("RULE_PARSE_ERROR");
    const entry = await prisma.activityLedger.findFirstOrThrow();
    await expect(
      prisma.activityLedger.update({
        where: { sequence: entry.sequence },
        data: { actionType: "TAMPER" },
      }),
    ).rejects.toBeDefined();
    expect((await verifyActivityLedger(prisma)).intact).toBe(true);
  });
  it("restricts operational mutations and identity visibility by role and assigned case", async () => {
    const { app, auth, c } = await setup();
    const auditor = await createTestUser({ role: "AUDITOR" }),
      lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const auditorToken = await loginAs(app, auditor.email),
      lawyerToken = await loginAs(app, lawyer.email);
    expect(
      (
        await request(app)
          .post("/api/v1/systems/identity/ingest")
          .set("Authorization", `Bearer ${auditorToken}`)
          .send({})
      ).status,
    ).toBe(403);
    await request(app)
      .post("/api/v1/systems/identity/ingest")
      .set(auth)
      .send({
        records: [
          {
            kind: "EVIDENCE",
            name: "Synthetic sealed exhibit",
            jurisdiction: "A",
            reference: "E-1",
            caseId: c.id,
          },
        ],
        reason: "Case evidence",
      });
    const result = await request(app)
      .post("/api/v1/systems/identity/match")
      .set("Authorization", `Bearer ${lawyerToken}`)
      .send({
        kind: "EVIDENCE",
        name: "Synthetic sealed exhibit",
        jurisdiction: "A",
        reference: "E-1",
      });
    expect(result.status).toBe(200);
    expect(result.body.data.matches).toEqual([]);
  });
});
