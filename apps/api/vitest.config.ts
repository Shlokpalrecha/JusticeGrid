import { defineConfig } from "vitest/config";

// Coverage gate per spec §11: apps/api services must hold >=80% statements.
// CI fails below this once domain services exist (Phase 4+).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Minimal valid config so config/env.ts's Zod validation passes during
    // tests without requiring a real .env file or database. Never real
    // secrets — this is a fixed test-only fixture.
    env: {
      DATABASE_URL: "postgresql://justicegrid:justicegrid@localhost:5432/justicegrid_test",
      JWT_SECRET: "test-only-secret-not-used-in-any-real-environment",
      JWT_REFRESH_SECRET: "test-only-refresh-secret-not-used-in-any-real-env",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts", "src/config/**"],
    },
  },
});
