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

describe("hearings — functional", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    app = createApp();
    // Hearing mutations recompute priority (spec §6.7), which requires
    // an active RulesetConfig — seed it here rather than in every `it`.
    const system = await createTestUser({ role: "ADMIN", email: "system@justicegrid.test" });
    await seedQueuePolicy(system.id);
  });

  it("lists hearings for a case, ascending by scheduledDate", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    await prisma.hearing.createMany({
      data: [
        {
          caseId: caseRow.id,
          scheduledDate: new Date("2026-08-01"),
          hearingType: "EVIDENCE",
          recordedById: admin.id,
        },
        {
          caseId: caseRow.id,
          scheduledDate: new Date("2026-06-01"),
          hearingType: "FIRST_PRODUCTION",
          recordedById: admin.id,
        },
      ],
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .get(`/api/v1/cases/${caseRow.id}/hearings`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].hearingType).toBe("FIRST_PRODUCTION");
  });

  it("updates a hearing's outcome and adjournment reason via PATCH", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const hearing = await prisma.hearing.create({
      data: {
        caseId: caseRow.id,
        scheduledDate: new Date("2026-06-01"),
        hearingType: "FIRST_PRODUCTION",
        recordedById: admin.id,
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .patch(`/api/v1/hearings/${hearing.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ outcome: "ADJOURNED", adjournmentReason: "Defence counsel unavailable" });

    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe("ADJOURNED");
    expect(res.body.data.adjournmentReason).toBe("Defence counsel unavailable");
  });

  it("marks a hearing's order as reviewed", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const caseRow = await createTestCase({ createdById: admin.id, assignedToId: admin.id });
    const hearing = await prisma.hearing.create({
      data: {
        caseId: caseRow.id,
        scheduledDate: new Date("2026-06-01"),
        hearingType: "BAIL_HEARING",
        recordedById: admin.id,
        orderSummary: "Bail denied",
        orderReceivedAt: new Date("2026-06-02T00:00:00Z"),
      },
    });
    const token = await loginAs(app, admin.email);

    const res = await request(app)
      .post(`/api/v1/hearings/${hearing.id}/mark-order-reviewed`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.orderReviewed).toBe(true);
    expect(res.body.data.orderReviewedById).toBe(admin.id);
  });

  it("GET /hearings/upcoming?days= returns only hearings within the window, scoped to the caller", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const otherLawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const myCase = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      caseRef: "JG-2026-0200",
    });
    const otherCase = await createTestCase({
      createdById: admin.id,
      assignedToId: otherLawyer.id,
      caseRef: "JG-2026-0201",
    });
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const farAway = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.hearing.create({
      data: {
        caseId: myCase.id,
        scheduledDate: soon,
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: myCase.id,
        scheduledDate: farAway,
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: otherCase.id,
        scheduledDate: soon,
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });

    const token = await loginAs(app, lawyer.email);
    const res = await request(app)
      .get("/api/v1/hearings/upcoming?days=7")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].caseRef).toBe("JG-2026-0200");
  });

  it("ADMIN sees upcoming hearings across every case", async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    const lawyer = await createTestUser({ role: "LEGAL_PROFESSIONAL" });
    const caseA = await createTestCase({
      createdById: admin.id,
      assignedToId: lawyer.id,
      caseRef: "JG-2026-0300",
    });
    const caseB = await createTestCase({
      createdById: admin.id,
      assignedToId: null,
      caseRef: "JG-2026-0301",
    });
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    await prisma.hearing.create({
      data: {
        caseId: caseA.id,
        scheduledDate: soon,
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });
    await prisma.hearing.create({
      data: {
        caseId: caseB.id,
        scheduledDate: soon,
        hearingType: "EVIDENCE",
        recordedById: admin.id,
      },
    });

    const token = await loginAs(app, admin.email);
    const res = await request(app)
      .get("/api/v1/hearings/upcoming?days=7")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data).toHaveLength(2);
  });
});
