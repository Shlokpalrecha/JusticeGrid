import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { createTestCase, createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

/** T1 (spec §11 traceability table): "Unauthorized users cannot access
 * cases." */
describe("cases security (T1)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("GET /cases requires authentication", async () => {
    const res = await request(app).get("/api/v1/cases");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /cases/:id requires authentication", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id });
    const res = await request(app).get(`/api/v1/cases/${caseRow.id}`);
    expect(res.status).toBe(401);
  });

  it("POST /cases requires authentication", async () => {
    const res = await request(app).post("/api/v1/cases").send({});
    expect(res.status).toBe(401);
  });

  it("rejects a malformed/garbage bearer token", async () => {
    const res = await request(app)
      .get("/api/v1/cases")
      .set("Authorization", "Bearer garbage.token.value");
    expect(res.status).toBe(401);
  });

  it("AUDITOR cannot create, update, assign, or record activity on a case (read-only)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const auditor = await createTestUser({ role: "AUDITOR" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: null });
    const token = await loginAs(app, auditor.email);

    const create = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(create.status).toBe(403);

    const update = await request(app)
      .patch(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ courtName: "New Court" });
    expect(update.status).toBe(403);

    const assign = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: admin.id });
    expect(assign.status).toBe(403);
  });

  it("AUDITOR can still read the case list and detail", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const auditor = await createTestUser({ role: "AUDITOR" });
    await createTestCase({ createdById: admin.id });
    const token = await loginAs(app, auditor.email);

    const list = await request(app).get("/api/v1/cases").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
  });
});
