import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, resetDatabase, TEST_USER_PASSWORD } from "../../test/dbHelpers.js";

async function loginAs(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: TEST_USER_PASSWORD });
  return res.body.data.accessToken as string;
}

describe("GET /audit/verify-chain (HTTP)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/audit/verify-chain");
    expect(res.status).toBe(401);
  });

  it("is forbidden for a LEGAL_PROFESSIONAL (spec §8.3's RBAC matrix: no audit access)", async () => {
    const user = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, user.email);
    const res = await request(app)
      .get("/api/v1/audit/verify-chain")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("writes an ACCESS_DENIED audit entry when a LEGAL_PROFESSIONAL is refused (spec §8.9)", async () => {
    const user = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const token = await loginAs(app, user.email);
    await request(app).get("/api/v1/audit/verify-chain").set("Authorization", `Bearer ${token}`);

    const denied = await prisma.auditLog.findFirst({ where: { action: "ACCESS_DENIED" } });
    expect(denied).not.toBeNull();
    expect(denied?.actorEmail).toBe(user.email);
    expect(denied?.success).toBe(false);
  });

  it("is allowed for AUDITOR and reports the chain as intact after normal activity", async () => {
    const auditor = await createTestUser({ role: "AUDITOR" });
    const token = await loginAs(app, auditor.email); // this login itself writes a LOGIN audit entry

    const res = await request(app)
      .get("/api/v1/audit/verify-chain")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.intact).toBe(true);
    expect(res.body.data.entriesChecked).toBeGreaterThan(0);
  });

  it("is allowed for ADMIN and reports a break after direct tampering", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const token = await loginAs(app, admin.email);

    const entry = await prisma.auditLog.findFirstOrThrow();
    // entityId is part of the hash formula (spec §5), unlike e.g.
    // entityLabel/summary — see lib/audit.test.ts's dedicated test of
    // that boundary.
    await prisma.auditLog.update({
      where: { id: entry.id },
      data: { entityId: "tampered-entity-id" },
    });

    const res = await request(app)
      .get("/api/v1/audit/verify-chain")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.intact).toBe(false);
    expect(res.body.data.firstBreakAtSequence).toEqual(expect.any(String));
  });
});
