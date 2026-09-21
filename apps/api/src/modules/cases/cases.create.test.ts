import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestPerson, createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

/** T2 (spec §11 traceability table): "A case can be created." */
describe("case creation (T2)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("ADMIN creates a case, unassigned by default", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const person = await createTestPerson();
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        caseRef: "JG-2026-0001",
        personId: person.id,
        courtName: "District Court",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-1",
        firNumberSynthetic: "FIR-0001",
        firYear: 2026,
        custodyType: "JUDICIAL",
        custodyStartDate: "2026-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.caseRef).toBe("JG-2026-0001");
    expect(res.body.data.assignedToId).toBeNull();

    const persisted = await prisma.case.findUnique({ where: { caseRef: "JG-2026-0001" } });
    expect(persisted).not.toBeNull();
    expect(persisted?.createdById).toBe(admin.id);
  });

  it("LEGAL_PROFESSIONAL creating a case is auto-assigned to themselves", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const person = await createTestPerson();
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        caseRef: "JG-2026-0002",
        personId: person.id,
        courtName: "District Court",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-1",
        firNumberSynthetic: "FIR-0002",
        firYear: 2026,
        custodyType: "NOT_IN_CUSTODY",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignedToId).toBe(lawyer.id);

    const history = await prisma.caseAssignmentHistory.findMany({
      where: { caseId: res.body.data.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.toUserId).toBe(lawyer.id);
  });

  it("writes a CREATE audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const person = await createTestPerson();
    const token = await loginAs(app, admin.email);

    await request(app).post("/api/v1/cases").set("Authorization", `Bearer ${token}`).send({
      caseRef: "JG-2026-0003",
      personId: person.id,
      courtName: "District Court",
      courtType: "District Court",
      district: "Central",
      state: "Delhi",
      policeStationAlias: "PS-1",
      firNumberSynthetic: "FIR-0003",
      firYear: 2026,
      custodyType: "JUDICIAL",
    });

    const entry = await prisma.auditLog.findFirst({
      where: { action: "CREATE", entityType: "Case" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.entityLabel).toBe("JG-2026-0003");
  });

  it("rejects a caseRef that doesn't match JG-YYYY-NNNN", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const person = await createTestPerson();
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        caseRef: "not-a-valid-ref",
        personId: person.id,
        courtName: "District Court",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-1",
        firNumberSynthetic: "FIR-0004",
        firYear: 2026,
        custodyType: "JUDICIAL",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a duplicate caseRef", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const person = await createTestPerson();
    const token = await loginAs(app, admin.email);
    const payload = {
      caseRef: "JG-2026-0005",
      personId: person.id,
      courtName: "District Court",
      courtType: "District Court",
      district: "Central",
      state: "Delhi",
      policeStationAlias: "PS-1",
      firNumberSynthetic: "FIR-0005",
      firYear: 2026,
      custodyType: "JUDICIAL",
    };

    const first = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("rejects a personId that does not exist", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${token}`)
      .send({
        caseRef: "JG-2026-0006",
        personId: "does-not-exist",
        courtName: "District Court",
        courtType: "District Court",
        district: "Central",
        state: "Delhi",
        policeStationAlias: "PS-1",
        firNumberSynthetic: "FIR-0006",
        firYear: 2026,
        custodyType: "JUDICIAL",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
