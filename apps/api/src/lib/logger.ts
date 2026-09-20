// Named import, not default: pino v9's ambient types resolve the default
// export to the whole module namespace (non-callable) under this project's
// "module": "NodeNext" + esModuleInterop combination. `pino` the named
// export is the actual callable factory. See pinojs/pino type defs.
import { pino } from "pino";
import { env } from "../config/env.js";

/**
 * Structured JSON logging with redaction of sensitive fields (spec §8.8).
 * Never log request bodies containing credentials.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "refreshToken",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
});
