import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests run the REAL booking transaction against a plain
 * Postgres database prepared by scripts/prepare-local-db.sh (the local
 * Supabase stand-in). They are skipped unless TEST_DATABASE_URL is set —
 * CI runs them against the local Supabase stack instead (see NOTES.md).
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
