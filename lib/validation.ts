import "server-only";
import { z } from "zod";
import type { HealthReport } from "./health";

/**
 * /api/health — input validation, fail-closed env contract, and the shape of
 * the sanitized response. See handbook §14 and lib/health.ts.
 */
export const healthEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
});

export const healthResponseSchema: z.ZodType<HealthReport> = z.object({
  status: z.enum(["ok", "unhealthy"]),
  version: z.string(),
  checkedAt: z.string(),
  checks: z
    .object({
      database: z.object({
        status: z.enum(["ok", "down"]),
        latencyMs: z.number().int().min(0),
      }),
    })
    .strict(),
});

/**
 * Request ID contract: accept a caller-supplied x-request-id only when it
 * matches ^[a-zA-Z0-9._-]{1,64}$, otherwise generate a UUID. Keeps upstream
 * proxies able to correlate (Better Stack → Vercel → Sentry → audit).
 */
export const requestIdPattern = /^[a-zA-Z0-9._-]{1,64}$/;
