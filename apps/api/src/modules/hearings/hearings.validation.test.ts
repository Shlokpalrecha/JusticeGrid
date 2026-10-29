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

/** T3 (spec §11 traceability table): "Invalid hearing date is
 * rejected." — spec §8.5: scheduledDate must not be before the case's
 * custodyStartDate. */
describe("hearing validation (T3)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
    // Hearing mutations recompute priority (spec §6.7), which requires
    // an active RulesetConfig — seed it here rather than in every `it`.
    const system = await createTestUser({ role: "ADMIN", email: "system@justicegrid.test" });
    await seedQueuePolicy(system.id);
  });

  it("rejects a scheduledDate before the case's custodyStartDate", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: new Date("2026-06-01T00:00:00.000Z"),
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        scheduledDate: "2026-05-01T00:00:00.000Z", // before custodyStartDate
        hearingType: "FIRST_PRODUCTION",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("scheduledDate");
  });

  it("accepts a scheduledDate on or after custodyStartDate", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: new Date("2026-06-01T00:00:00.000Z"),
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: "2026-06-01T00:00:00.000Z", hearingType: "FIRST_PRODUCTION" });

    expect(res.status).toBe(201);
  });

  it("accepts any scheduledDate when the case has no recorded custodyStartDate", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: null,
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: "2020-01-01T00:00:00.000Z", hearingType: "FIRST_PRODUCTION" });

    expect(res.status).toBe(201);
  });

  it("rejects an unknown hearingType", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: "2026-06-01T00:00:00.000Z", hearingType: "NOT_A_REAL_TYPE" });

    expect(res.status).toBe(400);
  });

  it("also rejects an invalid scheduledDate on hearing update (PATCH), not just create", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({
      createdById: admin.id,
      assignedToId: admin.id,
      custodyStartDate: new Date("2026-06-01T00:00:00.000Z"),
    });
    const hearing = await prisma.hearing.create({
      data: {
        caseId: caseRow.id,
        scheduledDate: new Date("2026-06-15T00:00:00.000Z"),
        hearingType: "FIRST_PRODUCTION",
        recordedById: admin.id,
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .patch(`/api/v1/hearings/${hearing.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: "2026-01-01T00:00:00.000Z" });

    expect(res.status).toBe(400);
  });

  it("recomputes the case's nextHearingDate after creating a future hearing", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const token = await loginAs(app, admin.email);
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

    await request(app)
      .post(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledDate: future, hearingType: "FIRST_PRODUCTION" });

    const updatedCase = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(updatedCase.nextHearingDate?.toISOString()).toBe(future);
  });
});
