import cron, { type ScheduledTask } from "node-cron";
import { civil } from "@justicegrid/rules-engine";
import { prisma } from "../lib/prisma.js";
import { createNotification } from "../lib/notifications.js";
import { logger } from "../lib/logger.js";
import { refreshScope } from "../modules/priority/priority.service.js";
export async function runNightlyRecompute(): Promise<void> {
  await refreshScope(undefined, true);
}
export async function runNightlyNotificationSweep(): Promise<void> {
  await refreshScope();
}
async function routineCapacityReminder(now: Date): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    for (const admin of admins) {
      const sent = await tx.actionNotification.createMany({
        data: [
          {
            episodeKey: "routine-capacity:" + civil(now.toISOString()),
            userId: admin.id,
            stage: "DAILY_REVIEW",
          },
        ],
        skipDuplicates: true,
      });
      if (sent.count)
        await createNotification(tx, {
          userId: admin.id,
          type: "PRIORITY_ESCALATED",
          title: "Review oldest unresolved follow-up work",
          body: "Allocate routine capacity using the oldest-work view. Critical deadlines keep their protected urgency.",
          relatedEntityType: "Queue",
          relatedEntityId: "oldest",
        });
    }
  });
}
export function startScheduledJobs(): ScheduledTask {
  let running = false,
    reconciledDay = "";
  async function tick() {
    if (running) return;
    running = true;
    try {
      const now = new Date(),
        day = civil(now.toISOString());
      await refreshScope(undefined, day !== reconciledDay);
      reconciledDay = day;
      await routineCapacityReminder(now);
    } catch (err) {
      logger.error({ err }, "Queue reconciliation failed");
    } finally {
      running = false;
    }
  }
  void tick();
  return cron.schedule(
    "* * * * *",
    () => {
      void tick();
    },
    { timezone: "Asia/Kolkata" },
  );
}
