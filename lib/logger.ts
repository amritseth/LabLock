import "server-only";
import pino from "pino";

/**
 * LabLock structured logger (Pino, JSON output).
 *
 * Redaction paths (see SECURITY.md §Threat model — Credential leakage):
 * authorization, cookie, password, token, idempotencyKey, email, serviceRoleKey —
 * plus common nested shapes, censored before the log line is written.
 */
const redactPaths = [
  "authorization",
  "cookie",
  "password",
  "token",
  "idempotencyKey",
  "email",
  "serviceRoleKey",
  "headers.authorization",
  "req.headers.authorization",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.token",
  "*.idempotencyKey",
  "*.email",
  "*.serviceRoleKey",
  "*.*.token",
  "*.*.password",
  "*.*.email",
];

export type Logger = pino.Logger;

export function createLogger(base: Record<string, unknown> = {}): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service: "lablock",
      environment: process.env.NODE_ENV ?? "development",
      ...base,
    },
    redact: {
      paths: redactPaths,
      censor: "[REDACTED]",
    },
    // Always write JSON (Vercel log ingestion); pino-pretty is a dev-time
    // pipeline choice, never a runtime transport.
  });
}

/**
 * Root logger for server-side modules.
 */
export const logger = createLogger();

/**
 * Request-scoped child logger — requestId is the correlation key that links
 * Sentry events, Vercel logs, and audit_events (see RUNBOOK §Observability).
 */
export function childLogger(requestId: string, extra: Record<string, unknown> = {}): Logger {
  return logger.child({ requestId, ...extra });
}
