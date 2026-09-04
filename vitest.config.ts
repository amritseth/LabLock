import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // The pure/unit-testable domain surface. DB-bound modules
      // (bookings, availability-service, supabase clients) are covered by
      // tests/integration against PostgreSQL — see NOTES.md §Testing.
      include: ["lib/health.ts", "lib/slots.ts", "lib/availability.ts", "lib/validation.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
