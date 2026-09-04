import { defineConfig, devices } from "@playwright/test";

/**
 * LabLock E2E — handbook §17 (browser E2E) + §11 (two-browser convergence).
 *
 * Two groups of specs:
 *  • e2e/public.spec.ts        — runs anywhere (no external services):
 *    landing, login placeholder, legal pages, fail-closed health, auth gates,
 *    security headers.
 *  • e2e/convergence.spec.ts   — the Slice C contract (two-browser update,
 *    disconnect/reconnect convergence). Requires a real Supabase project +
 *    seeded test users; auto-SKIPPED otherwise (env: E2E_SUPABASE_URL etc.).
 *
 * Run:  pnpm e2e                     (public suite)
 *       pnpm e2e:convergence         (convergence suite, when configured)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --hostname 0.0.0.0 --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
