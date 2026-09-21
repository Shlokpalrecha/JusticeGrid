import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, resetDatabase } from "../../test/dbHelpers.js";
import { loginAs } from "../../test/httpHelpers.js";

describe("GET /audit, GET /audit/:id, GET /audit/export.csv", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("GET /audit is forbidden for a LEGAL_PROFESSIONAL (unscoped VIEW_AUDIT_LOG, not the scoped case-level grant)", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, lawyer.email);

    const res = await request(app).get("/api/v1/audit").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("GET /audit lists entries newest-first for ADMIN, with pagination", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email); // login itself writes a LOGIN entry

    const res = await request(app)
      .get("/api/v1/audit")
      .query({ pageSize: 1 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /audit filters by action", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/audit")
      .query({ action: "LOGIN" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((e: { action: string }) => e.action === "LOGIN")).toBe(true);
  });

  it("GET /audit/:id returns a single entry, 404 for an unknown id", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);
    const entry = await prisma.auditLog.findFirstOrThrow();

    const found = await request(app)
      .get(`/api/v1/audit/${entry.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(found.status).toBe(200);
    expect(found.body.data.id).toBe(entry.id);

    const missing = await request(app)
      .get("/api/v1/audit/does-not-exist")
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });

  it("GET /audit/export.csv returns CSV and logs its own EXPORT audit entry", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get("/api/v1/audit/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("Sequence,Timestamp,Actor Email");

    const exportEntry = await prisma.auditLog.findFirst({
      where: { action: "EXPORT", entityType: "AuditLog" },
    });
    expect(exportEntry).not.toBeNull();
    expect(exportEntry?.actorId).toBe(admin.id);
  });

  it("GET /audit/export.csv is forbidden for a LEGAL_PROFESSIONAL", async () => {
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, lawyer.email);

    const res = await request(app)
      .get("/api/v1/audit/export.csv")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("AUDITOR can list and export (read-only, unscoped)", async () => {
    const auditor = await createTestUser({ role: "AUDITOR" });
    const token = await loginAs(app, auditor.email);

    const listRes = await request(app).get("/api/v1/audit").set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);

    const exportRes = await request(app)
      .get("/api/v1/audit/export.csv")
      .set("Authorization", `Bearer ${token}`);
    expect(exportRes.status).toBe(200);
  });
});
