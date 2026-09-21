import request from "supertest";
import type { Express } from "express";
import { TEST_USER_PASSWORD } from "./dbHelpers.js";

/** Logs in as `email` (must already exist with the standard
 * TEST_USER_PASSWORD) and returns its access token, for use with
 * `.set("Authorization", \`Bearer ${token}\`)`. */
export async function loginAs(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: TEST_USER_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken as string;
}

/**
 * Cases created via `dbHelpers.createTestCase` go straight through
 * Prisma, bypassing `cases.service.ts`'s `createCase` — so, unlike a
 * case created through `POST /cases`, no priority evaluation exists for
 * it yet (spec §6.7's create-time trigger never runs). Tests that need
 * an evaluated case call this right after `createTestCase` to seed one,
 * via the same real `POST /priority/case/:caseId/recompute` route any
 * other caller would use.
 */
export async function recomputeTestCase(
  app: Express,
  token: string,
  caseId: string,
): Promise<void> {
  const res = await request(app)
    .post(`/api/v1/priority/case/${caseId}/recompute`)
    .set("Authorization", `Bearer ${token}`);
  if (res.status !== 200) {
    throw new Error(
      `recomputeTestCase(${caseId}) failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
}
