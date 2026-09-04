# LabLock

> **One trusted schedule for the shared project lab.**
> Open the link, see a free one-hour slot, tap book — and the **database**, not a
> chat, confirms it is yours.

Reliable real-time booking for shared college labs. Slice A (deployment skeleton)
is locally verified; Slice B (auth + core booking) and Slice C (real-time
synchronization) are implemented in this repository and verified by unit +
integration tests. **Not yet deployed** — there is no live URL, no production
backups, and no real users today. See [METRICS.md](./METRICS.md) for the honest
numbers.

|               |                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack         | Next.js 16.2.10 + TypeScript 5.9 · Supabase (Auth + Postgres 17 + Realtime) · Vercel (Mumbai `bom1`) · Resend · Sentry · PostHog · Better Stack · GitHub Actions |
| Runtime pins  | Node **20.20.x**, pnpm **10.34.5** (exact, `packageManager` field)                                                                                               |
| Cost          | ~$25/mo (Supabase Pro) + domain at 100 users; Vercel Hobby + free observability tiers                                                                            |
| Status badges | `[✓]` implemented + locally verified · `[~]` designed, not implemented · `[!]` not yet verified/deployed                                                         |

## The one hard part

Two students tapping the same slot must not both win — and every other browser
must converge within seconds. Booking correctness is a **Postgres partial unique
index**; real-time convergence is a **refetch-on-event client algorithm**
(Realtime messages only invalidate; clients always refetch the canonical view).

```sql
CREATE UNIQUE INDEX bookings_one_confirmed_per_slot
  ON bookings (resource_id, starts_at)
  WHERE status = 'confirmed';
```

## Status — honest and current

| Component                                                             | Status | Evidence                                                                 |
| --------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Mobile-first landing, login placeholder, privacy/terms/changelog      | `[✓]`  | `app/page.tsx`, `app/login`, `app/privacy`, `app/terms`, `app/changelog` |
| Sanitized, fail-closed `/api/health` (2s probe, request-id, no-store) | `[✓]`  | `app/api/health/route.ts`, `lib/health.ts` + 3-case tests                |
| Pino structured logger with PII redaction                             | `[✓]`  | `lib/logger.ts`                                                          |
| Sentry integration points (DSN blank → no events yet)                 | `[✓]`  | `instrumentation.ts`, `sentry.*.config.ts`                               |
| Security headers (CSP, HSTS, COOP, X-Frame-Options DENY, …)           | `[✓]`  | `next.config.ts`                                                         |
| Supabase migrations: `healthcheck()` RPC + 7 booking tables           | `[✓]`  | `supabase/migrations/*.sql`                                              |
| Auth (Google OAuth PKCE + email OTP, httpOnly cookies, invite-only)   | `[✓]`  | `app/login`, `app/api/auth/*`, `lib/supabase/*`                          |
| Booking transaction (ten steps, one commit, idempotency)              | `[✓]`  | `lib/bookings.ts`                                                        |
| Operator: block/unblock slots, cancel any, audit trail                | `[✓]`  | `app/api/slot-blocks/*`, `app/api/audit`, `app/admin`                    |
| Realtime invalidation + subscribe→refetch→invalidate→refetch client   | `[✓]`  | `lib/use-availability-sync.ts`, `app/components/availability-client.tsx` |
| CI + gated deploy workflows (actions pinned by SHA)                   | `[✓]`  | `.github/workflows/ci.yml`, `deploy.yml`                                 |
| **Production deployment, live URL, backups, monitoring, users**       | `[!]`  | workflows exist, not executed                                            |

Slice A is locally verified but is **NOT considered shipped** until external
deployment, monitoring, database backups and the live URL are verified.

## Repository layout

```
lablock/
├── app/                       # Next.js App Router
│   ├── api/
│   │   ├── health/            # Sanitized, fail-closed health endpoint (public)
│   │   ├── availability/      # Occupancy view — authenticated (§12 matrix)
│   │   ├── bookings/          # POST create (idempotency key required); GET mine
│   │   ├── bookings/[id]/     # DELETE cancel (own future / operator any)
│   │   ├── slot-blocks/       # POST operator block; [id]/ DELETE unblock
│   │   ├── audit/             # GET operator-only audit trail
│   │   └── auth/              # OAuth PKCE callback + signout
│   ├── availability/          # The one core action screen
│   ├── admin/                 # Operator console
│   ├── login/ privacy/ terms/ changelog/
│   ├── page.tsx               # Landing (CTA + clearly-labeled demo slots)
│   ├── layout.tsx  globals.css  global-error.tsx
├── lib/
│   ├── health.ts (+test)      # Fail-closed health builder (3 cases)
│   ├── slots.ts (+test)       # Kolkata-hour alignment + 7-day window rules
│   ├── availability.ts (+test)# Occupancy view-builder + rule checks (pure)
│   ├── availability-service.ts# Server loader shared by API + page
│   ├── bookings.ts            # THE ten-step transaction, cancel, block, audit
│   ├── use-availability-sync.ts # §11 seven-step Refetch algorithm (client)
│   ├── db.ts                  # pg pool + withTransaction + sha256
│   ├── logger.ts              # Pino + redaction paths
│   ├── env.ts  validation.ts  request-id.ts  format-time.ts
│   └── supabase/              # admin (service role), server (cookies), client
├── supabase/
│   ├── config.toml            # Postgres 17, Realtime, invite-only auth settings
│   ├── migrations/            # healthcheck + profiles/resources/bookings/
│   │                          # slot_blocks/idempotency_records/audit_events/
│   │                          # availability_events (+ pg_cron cleanups)
│   └── seed.sql               # the one v1 resource: project-lab
├── tests/
│   ├── integration/           # invariant tests vs real Postgres (§17)
│   └── stubs/server-only.ts   # vitest alias
├── e2e/
│   ├── public.spec.ts         # 11 browser tests (no external services)
│   └── convergence.spec.ts    # §11 two-browser + reconnect (gated on local Supabase)
├── scripts/prepare-local-db.sh # local Supabase stand-in (DEV ONLY)
├── .github/                   # ci.yml, deploy.yml, dependabot.yml, PR template
├── instrumentation*.ts        # Sentry server/edge registration
├── next.config.ts             # security headers + withSentryConfig
└── README · METRICS · NOTES · RUNBOOK · SECURITY · CHANGELOG.md
```

## Request → code map

| Request                       | Code path                                                                 |
| ----------------------------- | ------------------------------------------------------------------------- |
| `GET /`                       | `app/page.tsx` (session-aware hero, demo slot strip)                      |
| `GET /login`                  | `app/login/page.tsx` → `SignInForm` (placeholder when unconfigured)       |
| `GET /availability`           | `app/availability/page.tsx` → `loadAvailability()` + `AvailabilityClient` |
| `GET /admin`                  | `app/admin/page.tsx` (operator role only)                                 |
| `GET /api/health`             | `route.ts` → `buildHealthReport()` → Supabase `healthcheck()` RPC         |
| `GET /api/availability`       | `route.ts` → `loadAvailability()` → `fetchOccupancy()`                    |
| `POST /api/bookings`          | `route.ts` → `bookSlot()` — ten-step transaction                          |
| `DELETE /api/bookings/:id`    | `route.ts` → `cancelBooking()`                                            |
| `POST /api/slot-blocks`       | `route.ts` → `blockSlot()` (operator)                                     |
| `DELETE /api/slot-blocks/:id` | `route.ts` → `unblockSlot()` (operator)                                   |
| `GET /api/audit`              | `route.ts` → `listAuditEvents()` (operator)                               |

## Quick start

```bash
# 1. Install (frozen, exact versions from pnpm-lock.yaml)
pnpm install --frozen-lockfile

# 2. Environment: copy .env.example → .env and fill Supabase values.
#    No Supabase? The app still runs: /api/health fails CLOSED with 503,
#    /login shows the placeholder, /availability explains what's missing.

# 3. Local Supabase (Docker) — the real local stack for migrations/Realtime
pnpm exec supabase start
pnpm exec supabase db reset --local        # migrations + seed.sql
pnpm exec supabase db lint --local --level warning

# 4. Run
pnpm dev                                    # http://localhost:3000

# 5. Verify everything (the CI contract)
pnpm check                                  # format + lint + typecheck + test + build
```

### Integration tests (invariant suite, needs PostgreSQL 17)

```bash
bash scripts/prepare-local-db.sh lablock_test        # DEV-only stand-in
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/lablock_test \
  pnpm test:integration
```

### Browser E2E

```bash
pnpm e2e                  # public suite (no external services) — 11 tests
pnpm e2e:convergence      # Slice C contract — requires `supabase start` + E2E_LOCAL_SUPABASE=1
```

The convergence spec (`e2e/convergence.spec.ts`) drives the real product path on
the local Supabase stack — OTP sign-in via Inbucket, real booking transaction,
Realtime invalidation — covering the §11 targets: two-browser update, and
convergence after disconnect/reconnect. It **skips** (never fails) when the
stack is absent.

### Invariant suite

The integration suite proves (§17 "Planned invariant tests"): 20 users target one slot →
exactly one winner; same idempotency key 20× → one booking; same key + different
payload → 409; lost-response retry replays the stored response; cancel/book
race keeps the invariant; blocks can't be overbooked; audit + realtime events +
idempotency response commit atomically with the booking (and a failed step
rolls back everything).

## Architecture (target — what this repository implements)

```
            ┌──────────────────────────────────────────────┐
 Browser ══▶│ Next.js on Vercel (bom1)                      │
 (RLS anon) │  Server Components · API routes · Pino logs    │
            └───────┬───────────────────────────┬───────────┘
                    │ service-role (server only) │ anon + Realtime (browser)
                    ▼                            ▼
        ┌──────────────────────────┐      ┌─────────────────────────┐
        │ Supabase Postgres 17     │      │ Supabase Realtime       │
        │  bookings  — TRUTH       │◀────▶│  availability_events    │
        │  + idempotency_records   │      │  (PII-free, invalidates)│
        │  + audit_events          │      └─────────────────────────┘
        │  + availability_events   │
        └──────────────────────────┘
```

Postgres is the sole booking authority. Realtime messages invalidate; clients
always refetch. Sentry (errors/perf), Pino JSON (Vercel logs), Better Stack
(uptime on `/api/health`), PostHog (funnel, Slice D) — correlated by
`x-request-id`.

## API contract

Endpoint matrix (§12): public `/`, `/login`, `/privacy`, `/terms`, `/changelog`,
`/api/health` · authenticated `/api/availability`, `/api/bookings`,
`/api/bookings/:id` · operator `/api/slot-blocks`, `/api/audit`.

Every state-changing route **requires** `x-idempotency-key`; `x-request-id` is
accepted when it matches `^[a-zA-Z0-9._-]{1,64}$`.

Success — `POST /api/bookings` → **200**:

```json
{
  "status": "confirmed",
  "bookingId": "b9f3…",
  "resourceId": "00000000-0000-0000-0000-000000000001",
  "startsAt": "2026-07-14T05:30:00.000Z",
  "confirmedAt": "2026-07-13T10:42:01.000Z",
  "requestId": "req_a1b2c3"
}
```

Conflict — **409**:

```json
{
  "status": "conflict",
  "reason": "slot_already_confirmed",
  "resourceId": "00000000-0000-0000-0000-000000000001",
  "startsAt": "2026-07-14T05:30:00.000Z",
  "requestId": "req_d4e5f6"
}
```

`reason` codes: `slot_already_confirmed`, `slot_blocked`, `booking_exists`,
`slot_already_blocked`, `booking_already_cancelled`, `idempotency_key_reuse`
(409) · `invalid_alignment`, `outside_window`, `slot_in_past`,
`invalid_input`, `missing_idempotency_key` (400) · `booking_not_found`,
`block_not_found`, `resource_not_found` (404) · `forbidden` (403) ·
`unauthorized` (401).

## Docs

| File                           | What it covers                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| [METRICS.md](./METRICS.md)     | Honest metrics — today every user metric is 0 / N/A; targets; weekly ritual          |
| [NOTES.md](./NOTES.md)         | Design decisions, rejected alternatives, timezone/idempotency subtleties, Later list |
| [RUNBOOK.md](./RUNBOOK.md)     | Deploy, rollback, incidents 1–3, backups, launch security checklist                  |
| [SECURITY.md](./SECURITY.md)   | Threat model, implemented controls, secret flow, PII boundaries                      |
| [CHANGELOG.md](./CHANGELOG.md) | Slice A → C, per release                                                             |

## Roadmap

**A. Deployment skeleton** `[✓]` · **B. Auth + core booking** `[✓]` ·
**C. Real-time hard part** `[✓]` — implemented & verified locally ·
**D. Analytics, onboarding, feedback** `[✓]` instrumentation (event taxonomy

- PII whitelist in `lib/analytics.ts`); PostHog DSN placeholder → no events
  captured yet; in-app feedback form `[~]` ·
  **E. Data-led hardening** `[~]` planned (quota if concentration >30%, restore
  drill, alert tuning).

Deliberately excluded from v1: waitlists, multiple labs, recurring
reservations, email/WhatsApp reminders, QR check-in, team accounts, approval
workflow, quotas, calendar sync, Redis, native app. Each enters scope only
with user evidence (NOTES.md).
