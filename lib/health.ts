import "server-only";

/**
 * /api/health — sanitized, fail-closed health report.
 *
 * Contract (handbook §14):
 *  • If NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing →
 *    HTTP 503 WITHOUT probing. Fail closed: if the probe cannot even attempt
 *    the DB, the system is not healthy and Better Stack must alert.
 *  • Success: { status:'ok', version, checkedAt, checks:{ database:{ ok, latencyMs } } }
 *  • Failure: same shape, status 'unhealthy', latencyMs 0.
 *  • The response exposes NO provider details, connection strings, schema
 *    names, or error text.
 *
 * Dependencies are injected so the three unit tests (lib/health.test.ts) can
 * verify all behaviours without a database.
 */

export interface HealthConfig {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface DatabaseProbe {
  probe: () => Promise<{ latencyMs: number }>;
}

export type HealthStatus = "ok" | "unhealthy";
export type DatabaseStatus = "ok" | "down";

export interface HealthReport {
  status: HealthStatus;
  version: string;
  checkedAt: string;
  checks: {
    database: {
      status: DatabaseStatus;
      latencyMs: number;
    };
  };
}

export interface HealthDeps {
  config: HealthConfig;
  probe: DatabaseProbe;
  version: string;
  now?: () => Date;
}

export async function buildHealthReport(deps: HealthDeps): Promise<HealthReport> {
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const configured = Boolean(
    deps.config.NEXT_PUBLIC_SUPABASE_URL && deps.config.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Fail closed: no config → 503, the probe must NEVER run.
  if (!configured) {
    return {
      status: "unhealthy",
      version: deps.version,
      checkedAt,
      checks: { database: { status: "down", latencyMs: 0 } },
    };
  }

  try {
    const { latencyMs } = await deps.probe.probe();
    return {
      status: "ok",
      version: deps.version,
      checkedAt,
      checks: { database: { status: "ok", latencyMs } },
    };
  } catch {
    // Any probe failure — never leak the underlying error text.
    return {
      status: "unhealthy",
      version: deps.version,
      checkedAt,
      checks: { database: { status: "down", latencyMs: 0 } },
    };
  }
}

/**
 * Release identifier for reports and Sentry release tagging:
 * VERCEL_GIT_COMMIT_SHA (first 12 chars) → package.json version → 'dev'.
 */
export function resolveAppVersion(readEnv: (name: string) => string | undefined): string {
  const commitSha = readEnv("VERCEL_GIT_COMMIT_SHA");
  if (commitSha) return commitSha.slice(0, 12);
  const pkgVersion = readEnv("NEXT_PUBLIC_APP_VERSION") ?? "0.1.0";
  return pkgVersion;
}
