import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { requireEnv } from "./env";

/**
 * Server-side Postgres access for transactional code (bookings, audit,
 * availability). The service role / direct connection path is the same trust
 * boundary documented in the handbook (§6 Component responsibility matrix):
 * Postgres is the sole booking authority.
 *
 * Supabase Realtime, auth and RLS remain Supabase-managed; this pool is used
 * only by server route handlers for the ten-step booking transaction.
 */
declare global {
  var __lablockPgPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: requireEnv("SUPABASE_DB_URL"),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Singleton pool (serverless-friendly: survives HMR and warm lambda reuse).
 */
export function getPgPool(): Pool {
  if (!globalThis.__lablockPgPool) {
    globalThis.__lablockPgPool = createPool();
  }
  return globalThis.__lablockPgPool;
}

export type Tx = PoolClient;

/**
 * Run `fn` inside one transaction: any throw rolls everything back. This is
 * the transaction boundary from handbook §9 — ten steps, one commit.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newId(): string {
  return randomUUID();
}
