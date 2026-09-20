import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@justicegrid/shared";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, resetDatabase, TEST_USER_PASSWORD } from "../../test/dbHelpers.js";
import * as authService from "./auth.service.js";

const ctx = { ipAddress: "127.0.0.1", userAgent: "vitest", requestId: "req-1" };

/**
 * Service-level tests, called directly rather than through HTTP — the
 * `/auth/login` route's rate limiter (5 req/15min/IP+email, spec §8.6)
 * shares its threshold with account lockout (5 consecutive failures,
 * also spec §8.6), so a precise test of lockout's own boundary needs to
 * bypass the route layer entirely; auth.routes.test.ts covers the HTTP
 * surface (envelopes, cookies, status codes) without needing to hit
 * that exact edge.
 */
describe("auth.service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("login", () => {
    it("issues a session for correct credentials and resets failure counters", async () => {
      const user = await createTestUser({ failedLoginAttempts: 2 });
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      expect(session.accessToken).toBeTruthy();
      expect(session.user.email).toBe(user.email);

      const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(refreshed.failedLoginAttempts).toBe(0);
      expect(refreshed.lastLoginAt).not.toBeNull();
    });

    it("never includes passwordHash anywhere in the returned session (T-item)", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      expect(JSON.stringify(session)).not.toContain(user.passwordHash);
      expect(session.user).not.toHaveProperty("passwordHash");
    });

    it("rejects an unknown email with the same generic message as a wrong password (no enumeration)", async () => {
      const user = await createTestUser();
      let unknownEmailMessage = "";
      let wrongPasswordMessage = "";
      try {
        await authService.login(
          { email: "nobody@justicegrid.test", password: "whatever12345" },
          ctx,
        );
      } catch (err) {
        unknownEmailMessage = (err as AppError).message;
      }
      try {
        await authService.login({ email: user.email, password: "definitely-wrong" }, ctx);
      } catch (err) {
        wrongPasswordMessage = (err as AppError).message;
      }
      expect(unknownEmailMessage).toBe(wrongPasswordMessage);
      expect(unknownEmailMessage).toBe("Invalid email or password.");
    });

    it("rejects an inactive account without revealing that it's inactive", async () => {
      const user = await createTestUser({ isActive: false });
      await expect(
        authService.login({ email: user.email, password: TEST_USER_PASSWORD }, ctx),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Invalid email or password." });
    });

    it("locks the account on the 5th consecutive failed attempt (spec §8.6)", async () => {
      const user = await createTestUser();

      for (let attempt = 1; attempt <= 4; attempt++) {
        await expect(
          authService.login({ email: user.email, password: "wrong" }, ctx),
        ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      }

      await expect(
        authService.login({ email: user.email, password: "wrong" }, ctx),
      ).rejects.toMatchObject({
        code: "ACCOUNT_LOCKED",
      });

      const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(locked.lockedUntil).not.toBeNull();
      expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      // The attempt counter resets once locked — the lockout timer, not
      // the counter, is what's now blocking further attempts.
      expect(locked.failedLoginAttempts).toBe(0);
    });

    it("rejects even a correct password while the account is still locked", async () => {
      const user = await createTestUser();
      for (let attempt = 1; attempt <= 5; attempt++) {
        await expect(
          authService.login({ email: user.email, password: "wrong" }, ctx),
        ).rejects.toBeInstanceOf(AppError);
      }
      await expect(
        authService.login({ email: user.email, password: TEST_USER_PASSWORD }, ctx),
      ).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    });

    it("allows login again once lockedUntil is manually expired (simulating time passing)", async () => {
      const user = await createTestUser({
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() - 1000), // already expired
      });
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      expect(session.accessToken).toBeTruthy();
    });

    it("writes a LOGIN audit entry on success and LOGIN_FAILED on failure", async () => {
      const user = await createTestUser();
      await authService.login({ email: user.email, password: TEST_USER_PASSWORD }, ctx);
      await expect(
        authService.login({ email: user.email, password: "wrong" }, ctx),
      ).rejects.toBeInstanceOf(AppError);

      const entries = await prisma.auditLog.findMany({ orderBy: { sequence: "asc" } });
      expect(entries.map((e) => e.action)).toEqual(["LOGIN", "LOGIN_FAILED"]);
      expect(entries.every((e) => e.actorEmail === user.email)).toBe(true);
    });
  });

  describe("refresh", () => {
    it("rotates the token: the new value differs and itself can be rotated again", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );

      const rotated = await authService.refresh(session.refreshTokenValue, ctx);
      expect(rotated.refreshTokenValue).not.toBe(session.refreshTokenValue);

      // Chaining a second, legitimate rotation off the new token proves
      // it's a live, usable token in its own right (not just "not the
      // old one") — replaying the *old* token instead, at this point,
      // is a reuse scenario covered by its own dedicated test below,
      // where it correctly burns this `rotated` token too.
      const rotatedAgain = await authService.refresh(rotated.refreshTokenValue, ctx);
      expect(rotatedAgain.accessToken).toBeTruthy();
      expect(rotatedAgain.refreshTokenValue).not.toBe(rotated.refreshTokenValue);
    });

    it("the old value stops working immediately after rotation", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      await authService.refresh(session.refreshTokenValue, ctx);

      await expect(authService.refresh(session.refreshTokenValue, ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("reuse detection: reusing a rotated token revokes the whole family", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      const rotated = await authService.refresh(session.refreshTokenValue, ctx);

      // Attacker replays the already-rotated-away original token.
      await expect(authService.refresh(session.refreshTokenValue, ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });

      // The legitimate holder's up-to-date token is now ALSO revoked —
      // the entire family was burned by the reuse.
      await expect(authService.refresh(rotated.refreshTokenValue, ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an unknown refresh token", async () => {
      await expect(authService.refresh("not-a-real-token-value", ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("logout", () => {
    it("revokes the session so the refresh token can no longer be used", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );
      await authService.logout(session.refreshTokenValue, ctx);
      await expect(authService.refresh(session.refreshTokenValue, ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("is idempotent for an already-unknown token", async () => {
      await expect(authService.logout("unknown-token-value", ctx)).resolves.toBeUndefined();
    });
  });

  describe("changePassword", () => {
    it("changes the password and revokes all existing sessions", async () => {
      const user = await createTestUser();
      const session = await authService.login(
        { email: user.email, password: TEST_USER_PASSWORD },
        ctx,
      );

      await authService.changePassword(
        user.id,
        { currentPassword: TEST_USER_PASSWORD, newPassword: "NewPassword@123456" },
        ctx,
      );

      await expect(authService.refresh(session.refreshTokenValue, ctx)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      await expect(
        authService.login({ email: user.email, password: TEST_USER_PASSWORD }, ctx),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const relogged = await authService.login(
        { email: user.email, password: "NewPassword@123456" },
        ctx,
      );
      expect(relogged.accessToken).toBeTruthy();
    });

    it("rejects an incorrect current password", async () => {
      const user = await createTestUser();
      await expect(
        authService.changePassword(
          user.id,
          { currentPassword: "wrong-current", newPassword: "NewPassword@123456" },
          ctx,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });
  });
});
