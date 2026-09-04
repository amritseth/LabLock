/**
 * Integration test setup: the application pool (lib/db.ts) reads
 * SUPABASE_DB_URL; the tests are pointed at the prepared database via
 * TEST_DATABASE_URL. Map one to the other BEFORE any lib module evaluates.
 */
const url = process.env.TEST_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is required. Run: bash scripts/prepare-local-db.sh && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/lablock_test pnpm test:integration",
  );
}
process.env.SUPABASE_DB_URL = url;
