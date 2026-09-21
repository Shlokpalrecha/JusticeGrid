import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startScheduledJobs } from "./jobs/nightlyJobs.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "JusticeGrid API listening");
});

const nightlyJob = startScheduledJobs();

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  nightlyJob.stop();
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
