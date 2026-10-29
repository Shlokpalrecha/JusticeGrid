import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import {
  createTestCase,
  createTestUser,
  resetDatabase,
  seedQueuePolicy,
} from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("documents", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
    // Document mutations recompute priority (spec §6.7), which requires
    // an active RulesetConfig — seed it here rather than in every `it`.
    const system = await createTestUser({ role: "ADMIN", email: "system@justicegrid.test" });
    await seedQueuePolicy(system.id);
  });

  it("POST /cases/:id/documents/apply-checklist seeds optional templates without asserting universal legal requirements", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents/apply-checklist`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.some(
        (d: { documentType: string; isMandatory: boolean }) =>
          d.documentType === "FIR_COPY" && !d.isMandatory,
      ),
    ).toBe(true);
  });

  it("applying the checklist twice is idempotent (no duplicates)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents/apply-checklist`)
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents/apply-checklist`)
      .set("Authorization", `Bearer ${token}`);

    const count = await prisma.documentRequirement.count({ where: { caseId: caseRow.id } });
    expect(count).toBe(second.body.data.length);

    const types = second.body.data.map((d: { documentType: string }) => d.documentType);
    expect(new Set(types).size).toBe(types.length);
  });

  it("moves a document from MISSING through REQUESTED to RECEIVED via PATCH", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const doc = await prisma.documentRequirement.create({
      data: { caseId: caseRow.id, documentType: "FIR_COPY", isMandatory: true },
    });
    const token = await loginAs(app, admin.email);

    const requested = await request(app)
      .patch(`/api/v1/documents/${doc.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "REQUESTED" });
    expect(requested.status).toBe(200);
    expect(requested.body.data.requestedAt).not.toBeNull();

    const received = await request(app)
      .patch(`/api/v1/documents/${doc.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "RECEIVED" });
    expect(received.status).toBe(200);
    expect(received.body.data.receivedAt).not.toBeNull();
  });

  it("verifies a RECEIVED document", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const doc = await prisma.documentRequirement.create({
      data: { caseId: caseRow.id, documentType: "FIR_COPY", isMandatory: true, status: "RECEIVED" },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/documents/${doc.id}/verify`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("VERIFIED");
    expect(res.body.data.verifiedById).toBe(admin.id);
  });

  it("cannot verify a document that hasn't been received yet", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const doc = await prisma.documentRequirement.create({
      data: { caseId: caseRow.id, documentType: "FIR_COPY", isMandatory: true, status: "MISSING" },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/documents/${doc.id}/verify`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects adding a duplicate documentType for the same case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "FIR_COPY", isMandatory: true });

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .send({ documentType: "FIR_COPY", isMandatory: true });

    expect(res.status).toBe(409);
  });
});
