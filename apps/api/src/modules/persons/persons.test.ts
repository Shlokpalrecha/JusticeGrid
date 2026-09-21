import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("persons", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("creates a synthetic person", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        aliasCode: "UT-0001",
        displayName: "Fictional Person",
        ageBand: "18-25",
        gender: "M",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.isSynthetic).toBe(true);
  });

  it("rejects isSynthetic: false at the API layer (spec §1.5 guardrail, end to end)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        aliasCode: "UT-0002",
        displayName: "Should Be Rejected",
        ageBand: "18-25",
        gender: "M",
        isSynthetic: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a duplicate aliasCode", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);
    const payload = { aliasCode: "UT-0003", displayName: "Person", ageBand: "26-35", gender: "F" };

    const first = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(second.status).toBe(409);
  });

  it("LEGAL_PROFESSIONAL can create and read persons", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, lawyer.email);

    const created = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send({ aliasCode: "UT-0004", displayName: "Person", ageBand: "36-45", gender: "M" });
    expect(created.status).toBe(201);

    const fetched = await request(app)
      .get(`/api/v1/persons/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fetched.status).toBe(200);
  });

  it("AUDITOR can read but not create persons", async () => {
    const auditor = await createTestUser({ role: "AUDITOR" });
    const token = await loginAs(app, auditor.email);

    const list = await request(app).get("/api/v1/persons").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post("/api/v1/persons")
      .set("Authorization", `Bearer ${token}`)
      .send({ aliasCode: "UT-0005", displayName: "Person", ageBand: "18-25", gender: "F" });
    expect(create.status).toBe(403);
  });

  it("returns 404 for a nonexistent person", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);
    const res = await request(app)
      .get("/api/v1/persons/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
