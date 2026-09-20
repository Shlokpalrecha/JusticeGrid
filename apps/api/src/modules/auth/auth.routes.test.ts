import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../app.js";
import { createTestUser, resetDatabase, TEST_USER_PASSWORD } from "../../test/dbHelpers.js";

function getCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`));
}

describe("auth routes (HTTP)", () => {
  let app: Express;

  beforeEach(async () => {
    await resetDatabase();
    // A fresh app per test resets express-rate-limit's in-memory store,
    // so the login rate limiter's window doesn't leak between tests.
    app = createApp();
  });

  it("POST /auth/login succeeds, returns the envelope shape, and sets an httpOnly refresh cookie", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.meta.requestId).toEqual(expect.any(String));

    const cookie = getCookie(res, "refreshToken");
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("never returns passwordHash anywhere in the login response (T-item)", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain(user.passwordHash);
  });

  it("POST /auth/login with a wrong password returns 401 UNAUTHENTICATED", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Invalid email or password.",
        requestId: expect.any(String),
      },
    });
  });

  it("POST /auth/login rejects a body with an unknown field (schema is .strict())", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD, extraField: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/login rejects a missing password with field-level detail", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "a@b.test" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "password" })]),
    );
  });

  it("locks the account on the 5th failed attempt, then rate-limits the 6th (spec §8.6)", async () => {
    const user = await createTestUser();
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: user.email, password: "wrong" });
      expect(res.status).toBe(401);
    }
    const fifth = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "wrong" });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");

    const sixth = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_LIMITED");
  });

  it("GET /auth/me requires authentication", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("GET /auth/me returns the authenticated user's profile without passwordHash", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const accessToken = login.body.data.accessToken as string;

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("GET /auth/me rejects a malformed Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "NotBearer xyz");
    expect(res.status).toBe(401);
  });

  it("POST /auth/refresh rotates the cookie and issues a new access token", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const originalCookie = getCookie(login, "refreshToken");

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie ?? "");
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const newCookie = getCookie(res, "refreshToken");
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(originalCookie);
  });

  it("POST /auth/refresh without a cookie is unauthenticated", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("POST /auth/refresh with a reused (already-rotated) token is rejected", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const originalCookie = getCookie(login, "refreshToken");

    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie ?? "");
    const reused = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie ?? "");
    expect(reused.status).toBe(401);
  });

  it("POST /auth/logout clears the refresh cookie and revokes the session", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const cookie = getCookie(login, "refreshToken");

    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie ?? "");
    expect(logoutRes.status).toBe(200);
    const clearedCookie = getCookie(logoutRes, "refreshToken");
    expect(clearedCookie).toMatch(/refreshToken=;/);

    const refreshAfterLogout = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie ?? "");
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("POST /auth/change-password requires authentication", async () => {
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "x", newPassword: "NewPassword@123456" });
    expect(res.status).toBe(401);
  });

  it("POST /auth/change-password rejects a too-short newPassword", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const accessToken = login.body.data.accessToken as string;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_USER_PASSWORD, newPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /auth/change-password succeeds with the correct current password", async () => {
    const user = await createTestUser();
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: TEST_USER_PASSWORD });
    const accessToken = login.body.data.accessToken as string;

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_USER_PASSWORD, newPassword: "BrandNewPassword@1" });
    expect(res.status).toBe(200);

    const relogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "BrandNewPassword@1" });
    expect(relogin.status).toBe(200);
  });
});
