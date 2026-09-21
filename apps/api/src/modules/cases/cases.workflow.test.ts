import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestCase, createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("case workflow: assign / unassign / archive / notes / charges", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("ADMIN assigns a case to an active user", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: lawyer.id, reason: "Workload balancing" });

    expect(res.status).toBe(200);
    expect(res.body.data.assignedToId).toBe(lawyer.id);

    const history = await prisma.caseAssignmentHistory.findMany({ where: { caseId: caseRow.id } });
    expect(history).toHaveLength(1);
    expect(history[0]?.toUserId).toBe(lawyer.id);
    expect(history[0]?.reason).toBe("Workload balancing");
  });

  it("cannot assign a case to an inactive user (spec §8.5)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const inactive = await createTestUser({ role: "LEGAL_PROFESSIONAL", isActive: false });
    const caseRow = await createTestCase({ createdById: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: inactive.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("LEGAL_PROFESSIONAL cannot assign cases (ADMIN-only capability)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: lawyer.id });

    expect(res.status).toBe(403);
  });

  it("unassigns a case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/unassign`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.assignedToId).toBeNull();
  });

  it("archives a case with a reason", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/archive`)
      .set("Authorization", `Bearer ${token}`)
      .send({ archivedReason: "Case disposed and closed" });

    expect(res.status).toBe(200);
    expect(res.body.data.isArchived).toBe(true);
    expect(res.body.data.archivedReason).toBe("Case disposed and closed");
  });

  it("adds a note to a case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/notes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Called the lawyer, awaiting response.", isInternal: true });

    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe("Called the lawyer, awaiting response.");
    expect(res.body.data.authorId).toBe(admin.id);
  });

  it("adds a charge to a case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/charges`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        actName: "IPC — synthetic",
        sectionCode: "302",
        isBailableFlag: false,
        severityBand: "SEVERE",
      });

    expect(res.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/charges`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);
  });

  it("GET /cases/:id returns the full aggregate with person, charges, and completeness", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.person).toBeDefined();
    expect(res.body.data.charges).toEqual([]);
    expect(res.body.data.fieldCompleteness.missingFields).toContain("charges");
    expect(res.body.data.fieldCompleteness.missingFields).not.toContain("custodyStartDate");
  });

  it("GET /cases/:id/timeline merges hearings, tasks, documents, and notes chronologically", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/notes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "First note" });
    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: "2026-06-05T00:00:00.000Z", hearingType: "FIRST_PRODUCTION" });

    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/timeline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const types = (res.body.data as { type: string }[]).map((e) => e.type);
    expect(types).toContain("NOTE");
    expect(types).toContain("HEARING");
  });

  it("GET /cases/:id/audit returns entries for the case and its child entities", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/notes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Audited note" });

    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/audit`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entityTypes = (res.body.data as { entityType: string }[]).map((e) => e.entityType);
    expect(entityTypes).toContain("CaseNote");
  });

  it("a LEGAL_PROFESSIONAL's own case audit trail is visible to them (scoped VIEW_AUDIT_LOG)", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: lawyer.id });
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/audit`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
