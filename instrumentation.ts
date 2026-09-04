/**
 * Sentry server/edge registration (handbook §5: "Sentry integration points").
 * DSN comes from NEXT_PUBLIC_SENTRY_DSN; when blank, Sentry initializes
 * without a DSN and no events are captured (Slice A behaviour — see
 * "DSN blank; no events captured yet" in the implementation matrix).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
