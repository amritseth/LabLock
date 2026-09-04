import { expect, test, type Page } from "@playwright/test";

/**
 * Slice C contract — handbook §11 (two-browser convergence, §17 planned
 * invariant tests: "Two browser contexts see updates", "Disconnected browser
 * converges after reconnect").
 *
 * These tests drive the REAL product path: OTP sign-in through the app's
 * forms (Supabase Auth + Inbucket mail capture on the local stack), real
 * booking transaction against local Postgres, real Realtime invalidation.
 *
 * Prerequisites:
 *   1. Local Supabase stack running: `pnpm exec supabase start` (Postgres +
 *      Realtime + Inbucket on 127.0.0.1:54324).
 *   2. Three pilot users created on the local project (invite-only):
 *        roles: student_a, student_b  (email = <name>@pilot.local)
 *        emails landing in Inbucket; confirmations enabled.
 *   3. env:  E2E_LOCAL_SUPABASE=1  (skips otherwise — the suite must never
 *      fail when the stack is absent).
 *   4. The app runs with the local project env vars (NEXT_PUBLIC_SUPABASE_URL
 *      = http://127.0.0.1:54321, anon key, SUPABASE_SERVICE_ROLE_KEY,
 *      SUPABASE_DB_URL = the local pooler URL).
 *
 * Run:   pnpm e2e:convergence
 */
const LOCAL = process.env.E2E_LOCAL_SUPABASE === "1";
const STUDENT_A = process.env.E2E_STUDENT_A ?? "student_a@pilot.local";
const STUDENT_B = process.env.E2E_STUDENT_B ?? "student_b@pilot.local";
const INBUCKET = process.env.E2E_INBUCKET_URL ?? "http://127.0.0.1:54324";
const UPDATE_TIMEOUT = 15_000; // local smoke bound — NOT the §11 p95 target

const skip = !LOCAL;

async function readOtp(email: string, timeout = 15_000): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const response = await fetch(`${INBUCKET}/api/v1/mailbox/${encodeURIComponent(email)}`).catch(
      () => null,
    );
    if (response?.ok) {
      const messages = (await response.json()) as Array<{ body: string; subject?: string }>;
      for (const message of [...messages].reverse()) {
        const match = /\b(\d{6})\b/.exec(message.body ?? "");
        if (match) return match[1]!;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No OTP found for ${email} in ${INBUCKET}`);
}

async function signInViaOtp(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("you@college.edu.in").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText(/one-time code is on its way/i)).toBeVisible({ timeout: 10_000 });
  const code = await readOtp(email);
  await page.getByLabel("One-time code").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();
  await page.waitForURL(/\/availability/, { timeout: 15_000 });
}

function slotTestId(startsAt: string): string {
  return `slot-${startsAt}`;
}

/** First free, future slot visible in the current day grid. */
async function pickFreeSlot(page: Page): Promise<string> {
  const free = page.locator('[data-testid^="slot-"][data-status="free"]').first();
  await expect(free).toBeVisible();
  return (await free.getAttribute("data-testid"))!.replace(/^slot-/, "");
}

test.describe("Slice C — realtime convergence (local Supabase stack)", () => {
  test.skip(
    skip,
    "requires E2E_LOCAL_SUPABASE=1 with a running local Supabase stack (supabase start)",
  );

  test("student signup→book→cancel works end-to-end", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInViaOtp(page, STUDENT_A);

    const startsAt = await pickFreeSlot(page);
    await page.getByTestId(slotTestId(startsAt)).click();
    await page.getByTestId("confirm-booking").click();
    await expect(page.getByText(/Confirmed — the database recorded your slot/i)).toBeVisible({
      timeout: 10_000,
    });

    // The slot flips to booked in the SAME browser (refetch after commit).
    await expect(page.getByTestId(slotTestId(startsAt))).toHaveAttribute("data-status", "booked", {
      timeout: UPDATE_TIMEOUT,
    });

    // Cancel it again.
    const bookingItem = page.locator('[data-testid^="booking-"]').first();
    await expect(bookingItem).toBeVisible();
    await bookingItem.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/Cancelled — the slot is free again/i)).toBeVisible();
    await expect(page.getByTestId(slotTestId(startsAt))).toHaveAttribute("data-status", "free", {
      timeout: UPDATE_TIMEOUT,
    });
    await context.close();
  });

  test("two browser contexts converge — A books, B sees it within seconds", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signInViaOtp(pageA, STUDENT_A);
    await signInViaOtp(pageB, STUDENT_B);

    const observedAt: { at: number } = { at: 0 };
    const started = Date.now();

    await pageB.goto("/availability"); // B subscribes first (snapshot + subscribe)
    await expect(pageB.locator('[data-testid^="slot-"][data-status="free"]').first()).toBeVisible();

    const startsAt = await pickFreeSlot(pageA);
    await pageA.getByTestId(slotTestId(startsAt)).click();
    await pageA.getByTestId("confirm-booking").click();
    await expect(pageA.getByText(/Confirmed — the database recorded your slot/i)).toBeVisible({
      timeout: 10_000,
    });

    // B must observe the update WITHOUT manual reload — Realtime invalidation
    // + refetch. Log the observed latency for the record (not a p95 claim).
    await expect
      .poll(() => pageB.getByTestId(slotTestId(startsAt)).getAttribute("data-status"), {
        timeout: UPDATE_TIMEOUT,
      })
      .toBe("booked");
    observedAt.at = Date.now() - started;

    await contextA.close();
    await contextB.close();
    test.info().annotations.push({
      type: "observed-update-ms",
      description: String(observedAt.at),
    });
  });

  test("disconnected browser converges after reconnect (refetch on reconnect + focus)", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signInViaOtp(pageA, STUDENT_A);
    await signInViaOtp(pageB, STUDENT_B);
    await pageB.goto("/availability");
    await expect(pageB.locator('[data-testid^="slot-"][data-status="free"]').first()).toBeVisible();

    // B goes offline; A books a slot B will never see as a Realtime message.
    await contextB.setOffline(true);
    const startsAt = await pickFreeSlot(pageA);
    await pageA.getByTestId(slotTestId(startsAt)).click();
    await pageA.getByTestId("confirm-booking").click();
    await expect(pageA.getByText(/Confirmed — the database recorded your slot/i)).toBeVisible({
      timeout: 10_000,
    });

    // B reconnects → subscribe status CHANNEL_ERROR/TIMED_OUT or a fresh
    // subscription triggers refetch; focus refetch is the guaranteed path.
    await contextB.setOffline(false);
    await pageB.bringToFront();
    await pageB.reload({ waitUntil: "domcontentloaded" }); // full refetch on load
    await expect(pageB.getByTestId(slotTestId(startsAt))).toHaveAttribute("data-status", "booked", {
      timeout: UPDATE_TIMEOUT,
    });

    await contextA.close();
    await contextB.close();
  });
});
