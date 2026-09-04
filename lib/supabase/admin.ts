import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Server-only Supabase client with the service-role key.
 * Never import from a client component; never expose the key to the browser.
 * Used for: healthcheck() RPC (the /api/health probe).
 */
let adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin(): ReturnType<typeof createClient> {
  if (adminClient) return adminClient;
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-client-info": "lablock-server" } },
  });
  return adminClient;
}

/**
 * Probe the database healthcheck() RPC (security definer; executable by
 * service_role only — see supabase/migrations/20260713000100_healthcheck.sql).
 * The 2-second timeout is owned by /api/health (Promise.race with a timer).
 */
export async function probeDatabase(): Promise<{ latencyMs: number }> {
  const started = Date.now();
  const { data, error } = await getSupabaseAdmin().rpc("healthcheck");
  if (error) throw error;
  if (!data || typeof data !== "object")
    throw new Error("healthcheck returned an unexpected shape");
  return { latencyMs: Date.now() - started };
}
