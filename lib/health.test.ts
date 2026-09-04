import { describe, expect, it, vi } from "vitest";
import { buildHealthReport, resolveAppVersion } from "./health";

/**
 * lib/health.test.ts — three cases, exactly the behaviours documented in the
 * handbook §14 (health endpoint behavior table):
 *   1. configured + probe succeeds → ok with latency
 *   2. config missing → unhealthy WITHOUT probing (fail closed)
 *   3. probe fails → unhealthy, latencyMs 0
 */
const config = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-0123456789",
};

describe("buildHealthReport", () => {
  it("returns ok with latency when configured and the probe succeeds", async () => {
    const report = await buildHealthReport({
      config,
      probe: { probe: vi.fn().mockResolvedValue({ latencyMs: 42 }) },
      version: "abc123def456",
      now: () => new Date("2026-07-13T10:00:00.000Z"),
    });

    expect(report.status).toBe("ok");
    expect(report.checks.database.status).toBe("ok");
    expect(report.checks.database.latencyMs).toBe(42);
    expect(report.version).toBe("abc123def456");
    expect(report.checkedAt).toBe("2026-07-13T10:00:00.000Z");
  });

  it("fails closed when configuration is missing and never probes", async () => {
    const probe = vi.fn().mockResolvedValue({ latencyMs: 5 });
    const report = await buildHealthReport({
      config: { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
      probe: { probe },
      version: "dev",
    });

    expect(report.status).toBe("unhealthy");
    expect(report.checks.database.status).toBe("down");
    expect(report.checks.database.latencyMs).toBe(0);
    expect(probe).not.toHaveBeenCalled();
  });

  it("reports unhealthy with latency 0 when the database probe fails", async () => {
    const report = await buildHealthReport({
      config,
      probe: { probe: vi.fn().mockRejectedValue(new Error("connection refused")) },
      version: "dev",
    });

    expect(report.status).toBe("unhealthy");
    expect(report.checks.database.status).toBe("down");
    expect(report.checks.database.latencyMs).toBe(0);
  });
});

describe("resolveAppVersion", () => {
  it("prefers the first 12 chars of the git commit SHA", () => {
    expect(
      resolveAppVersion((name) =>
        name === "VERCEL_GIT_COMMIT_SHA" ? "abcdef1234567890" : undefined,
      ),
    ).toBe("abcdef123456");
  });

  it("falls back to the app version when no commit SHA is available", () => {
    expect(resolveAppVersion(() => undefined)).toBe("0.1.0");
  });
});
