import type { User } from "@prisma/client";
import { AppError, type UserDto } from "@justicegrid/shared";
import { env } from "../../config/env.js";
import type { AuditActor, AuditRequestContext } from "../../lib/audit.js";
import { writeAuditEntry } from "../../lib/audit.js";
import { parseDurationMs } from "../../lib/duration.js";
import { hashPassword, verifyPassword } from "../../lib/hashing.js";
import { signAccessToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateFamilyId,
  generateRefreshTokenValue,
  hashRefreshTokenValue,
} from "../../lib/refreshTokens.js";
import type { ChangePasswordInput, LoginInput } from "./auth.schema.js";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    employeeCode: user.employeeCode,
    role: user.role,
    designation: user.designation,
    phone: user.phone,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdById: user.createdById,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function actorFromUser(user: User): AuditActor {
  return { id: user.id, email: user.email, role: user.role };
}

function systemActor(): AuditActor {
  return { id: null, email: "system", role: null };
}

export interface IssuedSession {
  accessToken: string;
  refreshTokenValue: string;
  refreshTokenExpiresAt: Date;
  user: UserDto;
}

async function issueSession(user: User): Promise<IssuedSession> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });

  const refreshTokenValue = generateRefreshTokenValue();
  const refreshTokenExpiresAt = new Date(Date.now() + parseDurationMs(env.REFRESH_TOKEN_TTL));
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshTokenValue(refreshTokenValue),
      familyId: generateFamilyId(),
      expiresAt: refreshTokenExpiresAt,
    },
  });

  return { accessToken, refreshTokenValue, refreshTokenExpiresAt, user: toUserDto(user) };
}

/**
 * Login (spec §8.2, §8.6): generic "Invalid email or password" on any
 * failure (unknown email, wrong password, inactive account) — never
 * revealing which, to avoid user enumeration. Lockout after 5
 * consecutive failures, for 15 minutes, tracked on the User row.
 *
 * Every branch that mutates a User row wraps that mutation and its
 * audit entry in one `$transaction` (spec §8.9) — a branch with no
 * mutation (unknown email, already-locked account, inactive account)
 * writes its audit entry standalone, since there's no mutation to couple
 * it with.
 */
export async function login(
  input: LoginInput,
  request: AuditRequestContext,
): Promise<IssuedSession> {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  const genericFailure = () => new AppError("UNAUTHENTICATED", "Invalid email or password.");

  if (!user || user.deletedAt) {
    await writeAuditEntry(prisma, systemActor(), request, {
      action: "LOGIN_FAILED",
      entityType: "User",
      entityLabel: email,
      summary: `Login attempt for unknown or deleted account: ${email}`,
      success: false,
      failureReason: "No such active account",
    });
    throw genericFailure();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await writeAuditEntry(prisma, actorFromUser(user), request, {
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      summary: `Login attempt for locked account: ${user.email}`,
      success: false,
      failureReason: "Account locked",
    });
    throw new AppError(
      "ACCOUNT_LOCKED",
      "This account is temporarily locked due to repeated failed sign-in attempts. Try again later.",
    );
  }

  if (!user.isActive) {
    await writeAuditEntry(prisma, actorFromUser(user), request, {
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      summary: `Login attempt for deactivated account: ${user.email}`,
      success: false,
      failureReason: "Account inactive",
    });
    throw genericFailure();
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    const failedAttempts = user.failedLoginAttempts + 1;
    const nowLocked = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nowLocked ? 0 : failedAttempts,
          lockedUntil: nowLocked ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      });
      await writeAuditEntry(tx, actorFromUser(user), request, {
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        entityLabel: user.email,
        summary: nowLocked
          ? `${user.email} locked out after ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive failed sign-in attempts`
          : `Failed sign-in attempt ${failedAttempts}/${MAX_FAILED_LOGIN_ATTEMPTS} for ${user.email}`,
        success: false,
        failureReason: "Incorrect password",
      });
    });

    if (nowLocked) {
      throw new AppError(
        "ACCOUNT_LOCKED",
        "This account is temporarily locked due to repeated failed sign-in attempts. Try again later.",
      );
    }
    throw genericFailure();
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await writeAuditEntry(tx, actorFromUser(u), request, {
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      summary: `${user.email} signed in`,
      success: true,
    });
    return u;
  });

  return issueSession(updatedUser);
}

/**
 * Refresh token rotation with reuse detection (spec §8.2): every refresh
 * both validates AND replaces the presented token. If the presented
 * token's hash matches a row that is already `revokedAt` (meaning it was
 * already rotated away once before), that's a reused token — evidence
 * the token was captured and is being replayed — so the entire token
 * family is revoked, forcing re-authentication everywhere that session
 * was used.
 */
export async function refresh(
  refreshTokenValue: string,
  request: AuditRequestContext,
): Promise<IssuedSession> {
  const tokenHash = hashRefreshTokenValue(refreshTokenValue);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw new AppError("UNAUTHENTICATED", "Invalid refresh token.");
  }

  if (stored.revokedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAuditEntry(tx, actorFromUser(stored.user), request, {
        action: "LOGOUT",
        entityType: "RefreshToken",
        entityId: stored.id,
        entityLabel: stored.user.email,
        summary: `Refresh token reuse detected for ${stored.user.email} — entire session family revoked`,
        success: false,
        failureReason: "Refresh token reuse detected",
      });
    });
    throw new AppError("UNAUTHENTICATED", "This session has been revoked. Please sign in again.");
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new AppError("UNAUTHENTICATED", "Refresh token has expired. Please sign in again.");
  }

  if (!stored.user.isActive || stored.user.deletedAt) {
    throw new AppError("UNAUTHENTICATED", "This account is no longer active.");
  }

  const newRefreshTokenValue = generateRefreshTokenValue();
  const newTokenHash = hashRefreshTokenValue(newRefreshTokenValue);
  const newExpiresAt = new Date(Date.now() + parseDurationMs(env.REFRESH_TOKEN_TTL));

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenHash: newTokenHash },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newTokenHash,
        familyId: stored.familyId,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  const accessToken = signAccessToken({
    sub: stored.user.id,
    email: stored.user.email,
    role: stored.user.role,
  });

  return {
    accessToken,
    refreshTokenValue: newRefreshTokenValue,
    refreshTokenExpiresAt: newExpiresAt,
    user: toUserDto(stored.user),
  };
}

/** Revokes the presented token's entire family — ending every session
 * derived from that login, not just the current device's token. */
export async function logout(
  refreshTokenValue: string,
  request: AuditRequestContext,
): Promise<void> {
  const tokenHash = hashRefreshTokenValue(refreshTokenValue);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored) return; // Already invalid/unknown — logout is idempotent.

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditEntry(tx, actorFromUser(stored.user), request, {
      action: "LOGOUT",
      entityType: "RefreshToken",
      entityId: stored.id,
      entityLabel: stored.user.email,
      summary: `${stored.user.email} signed out`,
      success: true,
    });
  });
}

export async function getMe(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError("NOT_FOUND", "User not found.");
  }
  return toUserDto(user);
}

/**
 * Changing your own password also revokes every refresh token family for
 * this user (spec doesn't mandate this explicitly, but it's the sound
 * default: a compromised-password scenario shouldn't leave old sessions
 * alive after the fix).
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  request: AuditRequestContext,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError("NOT_FOUND", "User not found.");
  }

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentOk) {
    throw new AppError("VALIDATION_ERROR", "Current password is incorrect.", [
      { field: "currentPassword", issue: "Incorrect password" },
    ]);
  }

  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAuditEntry(tx, actorFromUser(user), request, {
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
      entityLabel: user.email,
      summary: `${user.email} changed their password`,
      success: true,
    });
  });
}
