import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry configuration: errors + performance (tracesSampleRate
 * 0.1, handbook §14). PII capture disabled — sendDefaultPii: false.
 * Release tagging: first 12 chars of VERCEL_GIT_COMMIT_SHA, like /api/health.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
});
