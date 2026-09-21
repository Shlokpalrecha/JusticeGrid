import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { createTestCase, createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

/**
 * T7 (spec §11 traceability table): "Only assigned/permitted cases are
 * visible." IDOR: a LEGAL_PROFESSIONAL must get 403 on another user's
 * case via a direct API call, AND that case must not appear in their
 * list — spec §8.4 is explicit that hiding a button client-side is not
 * authorization; both properties are tested here, not just the direct
 * fetch.
 */
describe("cases authorization / IDOR (T7)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("a LEGAL_PROFESSIONAL gets 403 fetching a case assigned to someone else", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });

    const attackerToken = await loginAs(app, attacker.email);
    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("a LEGAL_PROFESSIONAL gets 403 updating a case assigned to someone else", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });

    const attackerToken = await loginAs(app, attacker.email);
    const res = await request(app)
      .patch(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ courtName: "Attacker's Court" });

    expect(res.status).toBe(403);

    const unchanged = await request(app)
      .get(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${await loginAs(app, owner.email)}`);
    expect(unchanged.body.data.courtName).not.toBe("Attacker's Court");
  });

  it("a restricted case does not appear in the LEGAL_PROFESSIONAL's case list", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const ownersCase = await createTestCase({
      createdById: admin.id,
      assignedToId: owner.id,
      caseRef: "JG-2026-0100",
    });
    await createTestCase({
      createdById: admin.id,
      assignedToId: attacker.id,
      caseRef: "JG-2026-0101",
    });

    const attackerToken = await loginAs(app, attacker.email);
    const res = await request(app)
      .get("/api/v1/cases")
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(ownersCase.id);
    expect(res.body.data).toHaveLength(1);
  });

  it("an unassigned case is invisible to every LEGAL_PROFESSIONAL, both directly and in the list", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const someone = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const unassigned = await createTestCase({ createdById: admin.id, assignedToId: null });

    const token = await loginAs(app, someone.email);
    const direct = await request(app)
      .get(`/api/v1/cases/${unassigned.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(direct.status).toBe(403);

    const list = await request(app).get("/api/v1/cases").set("Authorization", `Bearer ${token}`);
    expect(list.body.data).toHaveLength(0);
  });

  it("ADMIN and AUDITOR see every case, restricted or not", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const auditor = await createTestUser({ role: "AUDITOR" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });

    const adminToken = await loginAs(app, admin.email);
    const adminGet = await request(app)
      .get(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminGet.status).toBe(200);

    const auditorToken = await loginAs(app, auditor.email);
    const auditorGet = await request(app)
      .get(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(auditorGet.status).toBe(200);
  });

  it("hearings/tasks/documents sub-resources of a restricted case are also 403 (not just the case itself)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: owner.id });

    const token = await loginAs(app, attacker.email);

    const hearings = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`);
    expect(hearings.status).toBe(403);

    const tasks = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "x",
        category: "OTHER",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(tasks.status).toBe(403);

    const documents = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/documents`)
      .set("Authorization", `Bearer ${token}`);
    expect(documents.status).toBe(403);
  });

  it("gets 404, not 403, for a case id that doesn't exist at all", async () => {
    const someone = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, someone.email);
    const res = await request(app)
      .get("/api/v1/cases/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
