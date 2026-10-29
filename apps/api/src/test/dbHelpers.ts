import { DEFAULT_POLICY } from "@justicegrid/rules-engine";
import { hashPassword } from "../lib/hashing.js";
import { prisma } from "../lib/prisma.js";
import type { Case, CustodyType, Person, Role, QueuePolicy, User } from "@prisma/client";

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
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Refusing to truncate a non-test database");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "Notification", "SavedFilter",
      "RuntimeRuleDependency", "RuntimeTextRule", "Activity_Log", "WorkflowEdge", "WorkflowNode", "WorkflowGraph", "IdentityDecision", "SystemRecord", "SystemGeneration", "CaseRuleEvidence",
      "ActionNotification", "QueueEvaluation", "WorkflowAction", "LegalProfile", "QueuePolicy",
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

export interface CreateTestPersonOptions {
  aliasCode?: string;
  displayName?: string;
  ageBand?: string;
  gender?: string;
}

let personCounter = 0;

export async function createTestPerson(options: CreateTestPersonOptions = {}): Promise<Person> {
  personCounter += 1;
  return prisma.person.create({
    data: {
      aliasCode: options.aliasCode ?? `UT-TEST-${String(personCounter).padStart(4, "0")}`,
      displayName: options.displayName ?? `Test Person ${personCounter}`,
      ageBand: options.ageBand ?? "26-35",
      gender: options.gender ?? "X",
      isSynthetic: true,
    },
  });
}

export interface CreateTestCaseOptions {
  caseRef?: string;
  personId?: string;
  createdById: string;
  assignedToId?: string | null;
  custodyType?: CustodyType;
  custodyStartDate?: Date | null;
}

let caseCounter = 0;

export async function createTestCase(options: CreateTestCaseOptions): Promise<Case> {
  caseCounter += 1;
  const personId = options.personId ?? (await createTestPerson()).id;
  return prisma.case.create({
    data: {
      caseRef: options.caseRef ?? `JG-2026-${String(caseCounter).padStart(4, "0")}`,
      personId,
      courtName: "Test District Court",
      courtType: "District Court",
      district: "Test District",
      state: "Test State",
      policeStationAlias: "PS-TEST",
      firNumberSynthetic: `FIR-TEST-${caseCounter}`,
      firYear: 2026,
      custodyType: options.custodyType ?? "JUDICIAL",
      // `??` would coalesce an explicit `null` (caller wants "no
      // custody start date") to the default too — `"custodyStartDate"
      // in options` distinguishes "not provided" from "provided as
      // null".
      custodyStartDate:
        "custodyStartDate" in options
          ? options.custodyStartDate
          : new Date("2026-01-01T00:00:00.000Z"),
      createdById: options.createdById,
      assignedToId: options.assignedToId ?? null,
      assignedAt: options.assignedToId ? new Date() : null,
      assignedById: options.assignedToId ? options.createdById : null,
    },
  });
}

export async function seedQueuePolicy(activatedById: string): Promise<QueuePolicy> {
  return prisma.queuePolicy.create({
    data: {
      version: 1,
      config: DEFAULT_POLICY as never,
      isActive: true,
      createdById: activatedById,
      changeReason: "Test fixture",
    },
  });
}
