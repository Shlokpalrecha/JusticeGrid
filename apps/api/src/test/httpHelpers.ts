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
