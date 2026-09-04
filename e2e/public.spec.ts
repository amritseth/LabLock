import { expect, test } from "@playwright/test";

/**
 * Public-surface E2E — runs without any external provider (unconfigured mode):
 * the app is honest about what is missing (login placeholder, fail-closed
 * health 503, /availability redirect). Mirrors handbook §22 demo script and
 * §13/§14 behaviour tables.
 *
 * NOTE: these assertions assume the default unconfigured environment
 * (no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), which is the
 * state of the repository today.
 */

test.describe("landing page (handbook §22)", () => {
  test("hero, demo data label and honest status table render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Book the lab.");
    await expect(page.getByText("Skip the WhatsApp chase.")).toBeVisible();
    await expect(page.getByText("Demo data · sample week")).toBeVisible();
    await expect(page.getByRole("link", { name: "Join the pilot" })).toBeVisible();
    // Honesty statement from §5 — must never be removed.
    await expect(
      page.getByText(/Slice A is locally verified but is NOT considered shipped/),
    ).toBeVisible();
  });

  test("nav links work", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "The problem" }).click();
    await expect(
      page.getByRole("heading", { name: "The problem is weekly, not theoretical" }),
    ).toBeVisible();
  });
});

test.describe("login placeholder (handbook §5, §22)", () => {
  test("shows the placeholder and accepts no data when auth is not configured", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign-in opens in the next slice.")).toBeVisible();
    await expect(page.getByText(/invite-only/i)).toBeVisible();
  });
});

test.describe("legal + changelog pages (handbook §7)", () => {
  for (const path of ["/privacy", "/terms", "/changelog"]) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
    });
  }
});

test.describe("auth gates (handbook §12 endpoint matrix)", () => {
  test("/availability redirects unauthenticated visitors to /login", async ({ page }) => {
    await page.goto("/availability");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/admin redirects unauthenticated visitors to /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("/api/health — fail-closed contract (handbook §14)", () => {
  test("503 + sanitized shape when env is missing, and never probes", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: { "x-request-id": "e2e-health-1" },
    });
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database.status).toBe("down");
    expect(body.checks.database.latencyMs).toBe(0);
    expect(body.version).toBeTruthy();
    expect(body.checkedAt).toBeTruthy();
    // Sanitized: no provider details, no connection strings, no error text.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/postgres|connection|password|error|supabase\.co/i);
  });

  test("echoes a valid x-request-id and sets no-store", async ({ request }) => {
    const response = await request.get("/api/health", {
      headers: { "x-request-id": "e2e-trace-42" },
    });
    expect(response.headers()["x-request-id"]).toBe("e2e-trace-42");
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("security headers (handbook §13)", () => {
  test("the full header set is present on every response", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
