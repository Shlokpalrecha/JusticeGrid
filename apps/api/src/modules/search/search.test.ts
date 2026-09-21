import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestPerson,
  createTestUser,
  resetDatabase,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("search (T9)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("finds a case by caseRef", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, caseRef: "JG-2026-9999" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "9999" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cases.map((c: { id: string }) => c.id)).toContain(caseRow.id);
  });

  it("finds a person by aliasCode or displayName", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const person = await createTestPerson({
      aliasCode: "UT-FINDME",
      displayName: "Findable Person",
    });
    await createTestCase({ createdById: admin.id, personId: person.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "FINDME" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.persons.map((p: { id: string }) => p.id)).toContain(person.id);
  });

  it("finds a task by title", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const task = await prisma.task.create({
      data: {
        caseId: caseRow.id,
        title: "Unique searchable title",
        category: "OTHER",
        createdById: admin.id,
        dueDate: new Date(Date.now() + 86_400_000),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "searchable" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tasks.map((t: { id: string }) => t.id)).toContain(task.id);
  });

  it("scopes results to the caller's assigned cases for a LEGAL_PROFESSIONAL (T7-style IDOR check)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const owner = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const attacker = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: owner.id,
      caseRef: "JG-2026-7777",
    });
    const attackerToken = await loginAs(app, attacker.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "7777" })
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cases.map((c: { id: string }) => c.id)).not.toContain(caseRow.id);
  });

  it("an ADMIN sees results across all cases, unscoped", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      caseRef: "JG-2026-5555",
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "5555" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cases.map((c: { id: string }) => c.id)).toContain(caseRow.id);
  });

  it("rejects an empty query", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/search")
      .query({ q: "" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
