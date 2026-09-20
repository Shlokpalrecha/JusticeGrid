import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load the repo-root .env for local `pnpm dev` / tests. dotenv silently
// no-ops if the file doesn't exist and never overrides variables already
// present in process.env — so this is a no-op in Docker/CI, where real
// config is injected directly as environment variables.
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
loadDotenv({ path: path.join(repoRoot, ".env") });

/**
 * All runtime configuration is read from the environment and validated here
 * at boot (spec §8.10 / §13). The app refuses to start with a missing or
 * weak JWT_SECRET in production mode.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    JWT_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL: z.string().default("7d"),

    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    TZ: z.string().default("Asia/Kolkata"),
    SEED_DATE: z.string().optional(),
    DEMO_MODE: z.coerce.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      if (val.JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "JWT_SECRET must be at least 32 characters in production.",
        });
      }
      if (val.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_REFRESH_SECRET"],
          message: "JWT_REFRESH_SECRET must be at least 32 characters in production.",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration — refusing to start.");
  }
  return parsed.data;
}

export const env = loadEnv();
