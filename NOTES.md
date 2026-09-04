# LabLock — Engineering notes

Design decisions, rejected alternatives, subtleties, and the explicit Later
list. Every entry documents _why_. Nothing enters active scope without user
evidence.

## Core decisions (and rejected alternatives)

| Decision                                                    | Rejected alternative                        | Why                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres **partial unique index** is the correctness wall   | Redis distributed lock                      | Redis is a separate failure domain (flush/partition), cannot replace a database constraint. Even with a lock, you still need the index for defense in depth. Redis may throttle/cache later — never decide truth. See §9 of the handbook.             |
| Realtime messages **invalidate**, never apply               | Apply payload directly                      | Realtime can duplicate and reorder. Applying 'slot X is booked' twice or out of order creates wrong state. Refetch is idempotent and safe to repeat.                                                                                                  |
| **One Next.js application**                                 | Monorepo / microservices / separate API     | 20 users cannot justify the ops cost; the booking transaction needs a single DB; one deploy, one secret surface. Reconsider past 2–3 engineers or independent scaling needs.                                                                          |
| **Managed services** (Supabase, Vercel, Sentry)             | Self-host Postgres/auth/WS/email            | Removes DB/auth/WS/backup ops from the critical path; $25/mo at 100 users. Reconsider if cost exceeds value or data residency demands self-hosting.                                                                                                   |
| **Asia/Kolkata = fixed +05:30, no DST**                     | IANA/TZ database lookups at runtime         | IST has no DST. A fixed offset constant is deterministic, testable, and carries the invariant 'minute 0 in IST' in an explicit form. Delivery/rendering still uses `Intl` with `Asia/Kolkata` for display.                                            |
| Students see **occupancy only**; identity stays server-side | Expose booker rows to authenticated clients | Even an opaque `user_id` leaks a behavioural signal (WHEN the lab is busy for WHOM). The availability API answers with `free/booked/blocked` only; the raw bookings table has no client write policy and its read policies are own-row/operator-only. |
| Invite-only signup (`enable_signup = false`)                | Open signup                                 | Bounded blast radius, honest metrics, trusted cohort. Operator creates accounts on the allowlist; OTP login with `shouldCreateUser: false`.                                                                                                           |

## Subtleties worth remembering

1. **Idempotency hash ordering.** The handbook's pseudocode writes
   `ON CONFLICT (key) DO UPDATE SET request_hash = EXCLUDED.request_hash` and
   _then_ compares — the overwrite makes the reuse comparison always pass, so
   a key reused with a different payload would silently replay. This
   implementation keeps the **stored** hash
   (`SET request_hash = idempotency_records.request_hash`), takes the same row
   lock, and returns `409 idempotency_key_reuse` on mismatch. Verified by
   `same key + different payload → 409` integration test.

2. **Unique violations abort the whole transaction.** After `23505` you cannot
   write the 'rejected' idempotency record without a savepoint. The booking and
   block inserts run inside `SAVEPOINT … / ROLLBACK TO SAVEPOINT` so the 409
   response and `rejected` terminal state commit atomically with the conflict.
   Without this, the idempotency record would stay `pending` forever and a
   later retry would re-execute (still safe, but noisier).

3. **Async `cookies()`.** Auth-gated pages (`/availability`, `/admin`, and `/`)
   declare `export const dynamic = "force-dynamic"` — a prerendered redirect to
   `/login` would otherwise be baked at build time (verified in
   `.next/prerender-manifest.json`).

4. **RLS is defense at the PostgREST boundary; the write path is server-only.**
   Client tables have no insert/update/delete policies; all writes flow through
   service-role transactions in `lib/bookings.ts`. RLS still protects reads
   (own rows / operator / PII-free events) and is the authorization story at
   the API surface — plus the same role check in every route handler.

5. **`healthcheck()` is called by the service role with a 2s race.**
   supabase-js RPC options don't accept a per-call `signal`, so the timeout is
   a `Promise.race` in the route handler. Fail-closed: no config → 503 without
   probing (asserted by a test that proves the probe never runs).

6. **Slot identity everywhere.** Slots are compared as UTC ISO instants;
   `bookings.starts_at` is `timestamptz`. 'Aligned to the hour' means _minute 0
   in Kolkata_ — UTC minute 30 — and `slots.ts` encodes that invariant so the
   API never invents a 10:45 IST slot.

7. **PostHog events are whitelisted, not sanitized.** `lib/analytics.ts`
   drops every property not in the §15.1 taxonomy for that event BEFORE
   posthog-js sees it — email/name/user_id/booking_id are structurally
   impossible to send. `resource_id` carries the slug (`project-lab`), which
   is the same information class the taxonomy allows.
8. **`x-request-id` correlation.** Accepted only when matching
   `^[a-zA-Z0-9._-]{1,64}$` (otherwise a UUID is generated) and echoed on every
   Health response, so Better Stack → Vercel logs → Sentry → `audit_events`
   line up through one key.

## One-lab reality

`resources` is dimensioned for many labs later; v1 seeds exactly one row
(`project-lab`, fixed UUID `00000000-…-0001`) via `supabase/seed.sql`. The
operator console lists blocks and audit entries from the same truth tables.

## Later list (deliberately excluded from v1)

Waitlist + auto-promotion · multiple labs/equipment · recurring reservations ·
WhatsApp/email reminders · QR check-in · team accounts · approval workflow ·
fair-use quotas · calendar integration · Redis · native app · rich admin
dashboard.

**Promotion rule:** an item enters active scope only after user evidence shows
it blocks the core action, retention, or operations.

## Vercel deployment compatibility (2026-09)

- **Vercel accepts only `major.x` engine ranges** (`22.x`); a three-segment
  pin like `20.20.x` fails with "Found invalid Node.js Version".
- **Node 20 is a hard deadline**: EOL 2026-04-30; Vercel disables Node 20 for
  Builds and Functions on 2026-10-01. Any new deployment/function fails after
  that — existing functions keep running, which makes this easy to miss.
- **Sentry 9 does not support Next 16** (peer range stops at `^15.0.0-rc.0`).
  If a `pnpm` install or build ever complains about peer dependencies, go to
  the 10.x line, which lists `^16.0.0-0`.
- The workflow `supabase db push` step requires the `SUPABASE_DB_URL` GitHub
  secret — the preflight step now names exactly which Vercel env vars are
  missing before the build runs.

## Open questions / TODOs

- [ ] Connect provider accounts; first deploy (workflows are written and
      locally reviewed, never run on GitHub).
- [ ] Decide CSP report-only vs enforce after first deploy.
- [ ] Update operator contact + retention details in `/privacy` before pilot.
- [ ] Trigger `signup_completed` for the Google OAuth path (currently only the
      email-OTP verify step fires it; the OAuth callback is server-side and
      would need posthog-node or a client-side one-shot after redirect).
- [ ] Run `pnpm e2e:convergence` on a machine with `supabase start` (Inbucket)
      — the 3 gated tests cover §11 two-browser + reconnect convergence.
- [ ] Known dev-mode friction: the strict CSP (`script-src` without
      `unsafe-eval`) makes React's dev-only eval() warn in the browser console.
      Production builds never use eval (verified via `pnpm build`); decide
      report-only vs enforce after first deploy (§16 of the handbook).
- [ ] Operator assignment procedure: `update profiles set role='operator'
where id = <auth user id>;` — document in RUNBOOK before pilot.
- [ ] Broker Restore-drill for managed backups after Supabase Pro exists (§18).
