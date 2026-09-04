"use client";

/**
 * Product analytics — handbook §15.1 "Planned event taxonomy".
 *
 * Hard rules:
 *  • No PII, ever: email, name, user_id and booking_id are PROHIBITED
 *    properties. The whitelist below strips anything else at the source.
 *  • No-op when NEXT_PUBLIC_POSTHOG_KEY is absent (placeholder DSN — the
 *    same pattern as Sentry: integration points exist, no events captured
 *    until the project exists).
 *  • posthog-js is loaded lazily (dynamic import) from client handlers only —
 *    it is never in the server bundle. Session recording and autocapture are
 *    OFF so typed emails/names never reach PostHog.
 */

export type LabEvent =
  | "landing_cta_clicked"
  | "signup_started"
  | "signup_completed"
  | "availability_viewed"
  | "booking_started"
  | "booking_succeeded"
  | "booking_failed"
  | "booking_cancelled";

/** §15.1 taxonomy: properties allowed per event (everything else is dropped). */
const ALLOWED_PROPERTIES: Record<LabEvent, readonly string[]> = {
  landing_cta_clicked: ["source"],
  signup_started: ["method"],
  signup_completed: ["method", "duration_ms"],
  availability_viewed: ["resource_id", "date", "latency_ms"],
  booking_started: ["resource_id", "starts_at"],
  booking_succeeded: ["resource_id", "starts_at", "duration_ms"],
  booking_failed: ["resource_id", "starts_at", "reason_code"],
  booking_cancelled: ["resource_id", "starts_at", "actor_role"],
};

let initialized = false;
let posthogPromise: Promise<typeof import("posthog-js")> | null = null;

function getKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_KEY.length > 0
    ? process.env.NEXT_PUBLIC_POSTHOG_KEY
    : undefined;
}

export function capture(event: LabEvent, rawProps: Record<string, unknown> = {}): void {
  const key = getKey();
  if (!key) return; // DSN placeholder → integration point only (handbook §5)

  const allowed = ALLOWED_PROPERTIES[event];
  const props: Record<string, unknown> = {};
  for (const name of allowed) {
    if (name in rawProps) props[name] = rawProps[name];
  }

  posthogPromise ??= import("posthog-js");
  posthogPromise
    .then(({ default: posthog }) => {
      if (!initialized) {
        initialized = true;
        posthog.init(key, {
          api_host: "https://us.i.posthog.com",
          autocapture: false,
          capture_pageview: false,
          // Session recording stays off (typed emails/names must never reach
          // PostHog); advanced_disable_decide prevents the recorder setup.
          advanced_disable_decide: true,
        });
      }
      posthog.capture(event, props);
    })
    .catch(() => {
      // Analytics must never break the core action.
    });
}
