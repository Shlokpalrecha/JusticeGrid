import { seedWorkflowExamples } from "./workflows.js";
/**
 * JusticeGrid seed script (spec §10). Deterministic via
 * `faker.seed(20251020)`; every relative date is computed from the
 * script's own run time, so the demo always has a live "hearing in 2
 * days" case regardless of when it's run.
 *
 * Run: `pnpm db:seed` (or automatically via `pnpm db:reset`).
 */
import { faker } from "@faker-js/faker";
import { DEFAULT_POLICY } from "@justicegrid/rules-engine";
import { hashPassword } from "../../src/lib/hashing.js";
import { evaluateAndPersistCase } from "../../src/lib/priorityEvaluation.js";
import { disconnectPrisma, prisma } from "../../src/lib/prisma.js";
import { seedFixtureCases } from "./fixtures.js";
import { generateCases } from "./generators.js";

const SEED = 20251020;
const LAWYER_PASSWORD = "Lawyer@12345";

async function main() {
  const startedAt = Date.now();
  faker.seed(SEED);
  const now = new Date();

  console.log(
    "[seed] Resetting synthetic data (idempotent — upserts users, recreates the rest)...",
  );
  await prisma.$transaction([
    prisma.runtimeRuleDependency.deleteMany(),
    prisma.runtimeTextRule.deleteMany(),
    prisma.queuePolicy.deleteMany(),
    prisma.workflowEdge.deleteMany(),
    prisma.workflowNode.deleteMany(),
    prisma.workflowGraph.deleteMany(),
    prisma.identityDecision.deleteMany(),
    prisma.systemRecord.deleteMany(),
    prisma.caseRuleEvidence.deleteMany(),
    prisma.actionNotification.deleteMany(),
    prisma.queueEvaluation.deleteMany(),
    prisma.workflowAction.deleteMany(),
    prisma.legalProfile.deleteMany(),
    prisma.triggeredReason.deleteMany(),
    prisma.priorityEvaluation.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.caseAssignmentHistory.deleteMany(),
    prisma.caseNote.deleteMany(),
    prisma.documentRequirement.deleteMany(),
    prisma.task.deleteMany(),
    prisma.hearing.deleteMany(),
    prisma.charge.deleteMany(),
    prisma.case.deleteMany(),
    prisma.person.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.ruleVersion.deleteMany(),
    prisma.rule.deleteMany(),
    prisma.rulesetConfig.deleteMany(),
  ]);

  await prisma.systemGeneration.upsert({
    where: { id: "identity" },
    create: { id: "identity", revision: 1 },
    update: { revision: { increment: 1 } },
  });

  // ── Users (spec §10: 12 total) ──────────────────────────────────────
  console.log("[seed] Creating users...");
  const adminPasswordHash = await hashPassword("Admin@12345");
  const auditorPasswordHash = await hashPassword("Auditor@12345");
  const lawyerPasswordHash = await hashPassword(LAWYER_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: "admin@justicegrid.test" },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: "admin@justicegrid.test",
      passwordHash: adminPasswordHash,
      fullName: "Coordinator (Demo)",
      employeeCode: "EMP-ADMIN-001",
      role: "ADMIN",
      designation: "Legal Aid Coordinator",
    },
  });

  const auditor = await prisma.user.upsert({
    where: { email: "auditor@justicegrid.test" },
    update: { passwordHash: auditorPasswordHash },
    create: {
      email: "auditor@justicegrid.test",
      passwordHash: auditorPasswordHash,
      fullName: "Audit Reviewer (Demo)",
      employeeCode: "EMP-AUDITOR-001",
      role: "AUDITOR",
      designation: "Compliance Auditor",
      createdById: admin.id,
    },
  });

  const lawyers = [];
  for (let i = 1; i <= 10; i++) {
    const lawyer = await prisma.user.upsert({
      where: { email: `lawyer${i}@justicegrid.test` },
      update: { passwordHash: lawyerPasswordHash },
      create: {
        email: `lawyer${i}@justicegrid.test`,
        passwordHash: lawyerPasswordHash,
        fullName: `${faker.person.firstName()} ${faker.person.lastName()}`,
        employeeCode: `EMP-LAW-${String(i).padStart(3, "0")}`,
        role: "LEGAL_PROFESSIONAL",
        designation: "Legal Aid Counsel",
        createdById: admin.id,
      },
    });
    lawyers.push(lawyer);
  }
  console.log(`[seed] ${2 + lawyers.length} users ready.`);

  await prisma.queuePolicy.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      config: DEFAULT_POLICY as never,
      isActive: true,
      createdById: admin.id,
      changeReason: "Initial action queue policy",
    },
  });

  // ── Cases: the 6 mandatory fixtures + a realistic bulk set ─────────
  console.log("[seed] Creating the 6 mandatory fixture cases...");
  const fixtureCaseIds = await seedFixtureCases(prisma, {
    adminId: admin.id,
    lawyerId: lawyers[0]!.id,
    now,
  });

  await seedWorkflowExamples(prisma, fixtureCaseIds, admin.id, now);

  console.log("[seed] Generating bulk synthetic cases...");
  const generatedCount = await generateCases(
    prisma,
    { adminId: admin.id, lawyerIds: lawyers.map((l) => l.id), now },
    7,
  );

  // ── Evaluate every case (spec §6.7: the same engine the API uses) ──
  console.log("[seed] Evaluating priority for every case...");
  const allCaseIds = [
    ...fixtureCaseIds,
    ...(await prisma.case.findMany({ select: { id: true } }))
      .map((c) => c.id)
      .filter((id) => !fixtureCaseIds.includes(id)),
  ];
  let evaluated = 0;
  for (const caseId of allCaseIds) {
    await prisma.$transaction((tx) =>
      evaluateAndPersistCase(tx, caseId, { triggeredBy: "SYSTEM", triggeredById: null }),
    );
    evaluated += 1;
  }

  const distribution = await prisma.case.groupBy({
    by: ["currentPriorityLevel"],
    _count: true,
  });
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("[seed] Done in", durationSec, "s.");
  console.log(
    `[seed]   Users: ${2 + lawyers.length} (1 ADMIN, 1 AUDITOR [${auditor.email}], ${lawyers.length} LEGAL_PROFESSIONAL)`,
  );
  console.log(
    `[seed]   Cases: ${fixtureCaseIds.length} fixtures + ${generatedCount} generated = ${evaluated} evaluated`,
  );
  console.log(
    "[seed]   Priority distribution:",
    distribution.map((d) => `${d.currentPriorityLevel ?? "null"}=${d._count}`).join(", "),
  );
  console.log(
    "[seed]   Login: admin@justicegrid.test / Admin@12345, auditor@justicegrid.test / Auditor@12345, lawyer1..10@justicegrid.test / Lawyer@12345",
  );
}

main()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
