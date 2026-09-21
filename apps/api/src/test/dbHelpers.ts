import { DEFAULT_RULESET } from "../lib/defaultRuleset.js";
import { hashPassword } from "../lib/hashing.js";
import { prisma } from "../lib/prisma.js";
import type {
  Case,
  ConditionType,
  CustodyType,
  Person,
  Role,
  RuleCategory,
  RulesetConfig,
  User,
} from "@prisma/client";

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

export interface CreateTestRulesetConfigOptions {
  version?: number;
  highThreshold?: number;
  mediumThreshold?: number;
  maxScoreCap?: number | null;
  isActive?: boolean;
  activatedById: string;
  notes?: string | null;
}

let rulesetConfigCounter = 0;

/**
 * `evaluateAndPersistCase` (lib/priorityEvaluation.ts) throws if no
 * RulesetConfig row is `isActive`, so any test that creates/updates a
 * case, hearing, task, or document must seed one first — normally via
 * `seedDefaultRuleset` below, or this directly for tests that need
 * specific thresholds.
 */
export async function createTestRulesetConfig(
  options: CreateTestRulesetConfigOptions,
): Promise<RulesetConfig> {
  rulesetConfigCounter += 1;
  return prisma.rulesetConfig.create({
    data: {
      version: options.version ?? rulesetConfigCounter,
      highThreshold: options.highThreshold ?? 7,
      mediumThreshold: options.mediumThreshold ?? 3,
      maxScoreCap: options.maxScoreCap ?? null,
      isActive: options.isActive ?? true,
      activatedById: options.activatedById,
      notes: options.notes ?? null,
    },
  });
}

export interface CreateTestRuleOptions {
  code?: string;
  name?: string;
  description?: string;
  category?: RuleCategory;
  conditionType?: ConditionType;
  params?: Record<string, unknown>;
  weight?: number;
  isEnabled?: boolean;
  displayTemplate?: string;
  severityHint?: string | null;
  createdById: string;
  updatedById?: string;
}

let ruleCounter = 0;

export async function createTestRule(options: CreateTestRuleOptions) {
  ruleCounter += 1;
  return prisma.rule.create({
    data: {
      code: options.code ?? `R-TEST-${ruleCounter}`,
      name: options.name ?? `Test rule ${ruleCounter}`,
      description: options.description ?? "A rule created for a test.",
      category: options.category ?? "TASK",
      conditionType: options.conditionType ?? "TASK_OVERDUE",
      params: (options.params ?? { graceDays: 0 }) as never,
      weight: options.weight ?? 1,
      isEnabled: options.isEnabled ?? true,
      displayTemplate: options.displayTemplate ?? "{count}",
      severityHint: options.severityHint ?? null,
      createdById: options.createdById,
      updatedById: options.updatedById ?? options.createdById,
    },
  });
}

/**
 * Seeds the full spec §6.6 default ruleset (all 17 rules) plus an active
 * v1 RulesetConfig, exactly what any test exercising priority evaluation
 * end-to-end needs. Most tests should call this rather than hand-rolling
 * individual rules, so evaluated scores match what the spec's fixture
 * cases (§10) expect once Phase 7's seed script reuses the same
 * `DEFAULT_RULESET` constant. Also writes each rule's initial RuleVersion
 * row (changeReason "Initial seed"), matching what `createRule`
 * (rules.service.ts) does for an API-created rule — so a rule's version
 * history is complete from the start rather than only beginning at its
 * first update.
 */
export async function seedDefaultRuleset(activatedById: string): Promise<RulesetConfig> {
  const config = await createTestRulesetConfig({ version: 1, activatedById });
  for (const rule of DEFAULT_RULESET) {
    const r = await prisma.rule.create({
      data: {
        code: rule.code,
        name: rule.name,
        description: rule.description,
        category: rule.category,
        conditionType: rule.conditionType,
        params: rule.params as never,
        weight: rule.weight,
        isEnabled: true,
        displayTemplate: rule.displayTemplate,
        createdById: activatedById,
        updatedById: activatedById,
      },
    });
    await prisma.ruleVersion.create({
      data: {
        ruleId: r.id,
        version: r.version,
        snapshotJson: {
          code: r.code,
          name: r.name,
          description: r.description,
          category: r.category,
          conditionType: r.conditionType,
          params: r.params as never,
          weight: r.weight,
          isEnabled: r.isEnabled,
          displayTemplate: r.displayTemplate,
          severityHint: r.severityHint,
          version: r.version,
        },
        changedById: activatedById,
        changeReason: "Initial seed",
      },
    });
  }
  return config;
}
