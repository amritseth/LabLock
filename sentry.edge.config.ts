import * as Sentry from "@sentry/nextjs";

/**
 * Edge-runtime Sentry configuration (Mumbai/edge routes). PII disabled.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
});
