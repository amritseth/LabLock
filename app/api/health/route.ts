import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { buildHealthReport, resolveAppVersion } from "@/lib/health";
import { probeDatabase } from "@/lib/supabase/admin";
import { resolveRequestId } from "@/lib/request-id";
import { childLogger } from "@/lib/logger";
import { healthEnvironmentSchema } from "@/lib/validation";

/**
 * GET /api/health — sanitized, fail-closed health endpoint (handbook §14).
 *
 *  • Runtime: nodejs (pg + RPC probe), force-dynamic, preferredRegion bom1.
 *  • Fail closed: missing config → HTTP 503 WITHOUT probing.
 *  • 2-second database probe timeout.
 *  • Response exposes only status/version/checkedAt/database latency —
 *    never connection strings, schema names, provider versions, or error text.
 *  • x-request-id: accepted when it matches ^[a-zA-Z0-9._-]{1,64}$,
 *    otherwise a random UUID is generated; returned on every response.
 *  • Cache-Control: no-store. Better Stack polls this endpoint.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["bom1"];

const probeTimeoutMs = 2_000;

function readHealthConfig(): z.infer<typeof healthEnvironmentSchema> | null {
  const parsed = healthEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = childLogger(requestId, { route: "/api/health" });
  const version = resolveAppVersion((name) => process.env[name]);

  const config = readHealthConfig();
  const report = await buildHealthReport({
    config: config ?? {},
    probe: {
      probe: () =>
        Promise.race([
          probeDatabase(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("healthcheck RPC timed out")), probeTimeoutMs),
          ),
        ]),
    },
    version,
  });

  const headers = {
    "Cache-Control": "no-store",
    "x-request-id": requestId,
  };

  if (report.status === "ok") {
    log.info({ databaseLatencyMs: report.checks.database.latencyMs }, "health check ok");
    return NextResponse.json(report, { status: 200, headers });
  }

  const reason = config ? "database_unhealthy" : "config_missing";
  log.error({ reason }, "health check failed");
  Sentry.captureException(new Error(`health check failed: ${reason}`), {
    tags: { component: "health-check" },
    extra: { requestId },
  });
  return NextResponse.json(report, { status: 503, headers });
}
