import { randomUUID } from "node:crypto";
import cron, { type ScheduledTask } from "node-cron";
import type { AuditActor, AuditRequestContext } from "../lib/audit.js";
import { logger } from "../lib/logger.js";
import { recomputeAllCases } from "../modules/rules/rules.service.js";

/**
 * spec §6.7 / §13: every case is recomputed nightly at 02:00 IST, because
 * day-boundary crossings change what "overdue" or "within N days" means
 * even when nothing about the case itself changed. Runs as a system
 * actor (`id: null`) — `lib/audit.ts`'s `AuditActor` and
 * `rules.service.ts`'s `recomputeAllCases` both support this explicitly,
 * since there is no authenticated user behind a scheduled trigger.
 */
const SYSTEM_ACTOR: AuditActor = {
  id: null,
  email: "system@justicegrid.internal",
  role: null,
};

export async function runNightlyRecompute(): Promise<void> {
  const request: AuditRequestContext = {
    ipAddress: null,
    userAgent: "node-cron/nightly-recompute",
    requestId: randomUUID(),
  };

  logger.info("Nightly priority recompute starting");
  try {
    const { recomputedCount } = await recomputeAllCases(SYSTEM_ACTOR, request, "SCHEDULED");
    logger.info({ recomputedCount }, "Nightly priority recompute finished");
  } catch (err) {
    logger.error({ err }, "Nightly priority recompute failed");
  }
}

/**
 * Starts the nightly cron schedule. Called once from `server.ts` (never
 * from `app.ts`, which `vitest`'s integration tests instantiate directly
 * and repeatedly via `createApp()` — scheduling a real cron task there
 * would leak a timer per test file).
 */
export function startScheduledJobs(): ScheduledTask {
  return cron.schedule(
    "0 2 * * *",
    () => {
      void runNightlyRecompute();
    },
    { timezone: "Asia/Kolkata" },
  );
}
