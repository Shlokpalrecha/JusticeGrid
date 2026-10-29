import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.E2E_WEB_PORT ?? 5173),
  apiPort = Number(process.env.E2E_API_PORT ?? 4000);
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error(
    "Browser tests require E2E_DATABASE_URL pointing to a dedicated database whose name ends in _test.",
  );

// E2E suite (Phase 11) drives the real app against a seeded backend.
// webServer boots both apps automatically when running `pnpm test:e2e`
// outside of an already-running dev session.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node node_modules/tsx/dist/cli.mjs src/server.ts",
      cwd: "apps/api",
      url: `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        PORT: String(apiPort),
        CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
        LOG_LEVEL: "warn",
      },
      timeout: 120_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: "apps/web",
      url: `http://127.0.0.1:${webPort}`,
      env: { VITE_API_URL: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
