import { hashPassword } from "../lib/hashing.js";
import { prisma } from "../lib/prisma.js";
import type { Role, User } from "@prisma/client";

/**
 * Shared integration-test database helpers (used from Phase 3 onward by
 * every module's *.test.ts that needs a real, migrated Postgres — see
 * apps/api/vitest.config.ts's `justicegrid_test` DATABASE_URL).
 *
 * `resetDatabase` truncates every application table and restarts every
 * identity/sequence (including AuditLog's `sequence` bigserial, so
 * hash-chain assertions in audit tests get a predictable starting point)
 * — called from a `beforeEach` in each test file so tests never leak
 * state into one another, deliberately traded for simplicity over
 * per-test unique-data isolation given this suite's modest size.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "Notification", "SavedFilter",
      "TriggeredReason", "PriorityEvaluation",
      "RuleVersion", "Rule", "RulesetConfig",
      "CaseAssignmentHistory", "CaseNote", "DocumentRequirement", "Task", "Hearing", "Charge",
      "Case", "Person",
      "RefreshToken", "User"
    RESTART IDENTITY CASCADE
  `);
}

export interface CreateTestUserOptions {
  email?: string;
  password?: string;
  fullName?: string;
  employeeCode?: string;
  role?: Role;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}

export const TEST_USER_PASSWORD = "Test@12345678";

let userCounter = 0;

export async function createTestUser(options: CreateTestUserOptions = {}): Promise<User> {
  userCounter += 1;
  const passwordHash = await hashPassword(options.password ?? TEST_USER_PASSWORD);
  return prisma.user.create({
    data: {
      email: options.email ?? `test-user-${userCounter}@justicegrid.test`,
      passwordHash,
      fullName: options.fullName ?? `Test User ${userCounter}`,
      employeeCode: options.employeeCode ?? `EMP-${userCounter}`,
      role: options.role ?? "LEGAL_PROFESSIONAL",
      isActive: options.isActive ?? true,
      failedLoginAttempts: options.failedLoginAttempts ?? 0,
      lockedUntil: options.lockedUntil ?? null,
    },
  });
}
