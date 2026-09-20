import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Single shared Prisma client for the whole process. `pnpm dev` (tsx
 * watch) re-executes this module on every file change; without a global
 * cache, that would open a new pool of DB connections on every reload
 * and eventually exhaust Postgres's connection limit — the standard
 * Prisma-in-dev guard below prevents that.
 */
declare global {
  // eslint-disable-next-line no-var -- global augmentation requires `var`
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "warn" },
            { emit: "event", level: "error" },
          ]
        : [{ emit: "event", level: "error" }],
  });

prisma.$on("warn" as never, (e: unknown) => logger.warn({ prisma: e }, "Prisma warning"));
prisma.$on("error" as never, (e: unknown) => logger.error({ prisma: e }, "Prisma error"));

if (env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
