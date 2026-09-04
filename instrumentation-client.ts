"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Browser Sentry configuration (handbook §13: sendDefaultPii: false —
 * see "Sentry PII disabled" in the implemented security controls).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
