# Changelog

All notable changes to LabLock. Format: [Keep a Changelog](https://keepachangelog.com/);
status vocabulary: `[✓] implemented + locally verified`, `[~] designed`,
`[!] not yet verified / deployed`. Nothing below has been deployed yet — the
first live release is recorded here only after it happens.

## [0.1.0] — 2026-07-13 · Slice A: Deployment skeleton — `[✓] locally verified · [!] not deployed`

### Added

- Mobile-first landing page (`app/page.tsx`) with hero "Book the lab. Skip the
  WhatsApp chase.", clearly-labeled demo slot data, problem/evidence section,
  and an honest status table.
- Login **placeholder** (`app/login`) — accepts no data until auth is wired.
- Privacy / pilot terms / changelog pages.
- **`GET /api/health`** — sanitized, fail-closed (missing config → 503 without
  probing), 2s probe timeout, `x-request-id` correlation, `no-store`.
- Pino structured logger with PII redaction (`lib/logger.ts`).
- Sentry integration points (DSN blank — no events captured yet).
- Security headers: CSP, HSTS, COOP, X-Frame-Options DENY, Referrer-Policy,
  X-Content-Type-Options, Permissions-Policy.
- Supabase migration: `healthcheck()` RPC — security definer, service_role only.
- CI workflow (format/lint/typecheck/test/build + database reset/lint job) and
  gated deploy workflow — actions pinned by SHA, frozen lockfile.
- Dependabot (weekly, npm + GitHub Actions) + PR template.
- Docs: README, METRICS, NOTES, RUNBOOK, SECURITY, CHANGELOG.

## [0.2.0] — 2026-07-14 · Slice B: Auth + core booking — `[✓] implemented + locally verified`

### Added

- **Migrations**: `profiles` (role enum + auth trigger + RLS), `resources`,
  `bookings` (+ **partial unique index** `bookings_one_confirmed_per_slot`),
  `slot_blocks`, `idempotency_records`, `audit_events`, `availability_events`
  (PII-free) — RLS policies on every table; pg_cron cleanup jobs.
- **The ten-step booking transaction** (`lib/bookings.ts`): auth → idempotency
  claim → request hash → slot rules → booking insert → audit → availability
  event → save response → commit. Savepoints around the invariant guard; exact
  §9 200/409 response shapes.
- **Idempotency** §10: same key + same payload → stored response; key reuse →
  `409 idempotency_key_reuse` (fixed hash binding); no key → 400; 30-day
  retention with daily cleanup.
- Invite-only auth: Google OAuth (PKCE) + email OTP, httpOnly cookies, rate
  limits; `/api/auth/callback` + `/api/auth/signout`.
- Availability API (occupancy-only, never identity) + the one-core-action
  screen (`/availability`) with booking confirmation shown **only after the
  transaction commits**.
- Cancel own (student) / any (operator); operator block & unblock; audit
  endpoint; operator console (`/admin`).
- Integration test suite (15 tests) against real PostgreSQL 17: 20-race,
  cancel/book race, idempotency matrix, slot rules, blocks, atomicity.

## [0.3.0] — 2026-07-15 · Slice C: Real-time synchronization — `[✓] implemented + locally verified`

### Added

- Supabase Realtime publication on `availability_events` (PII-free payloads;
  no user id, no email).
- Seven-step client algorithm (`lib/use-availability-sync.ts`): snapshot →
  subscribe → refetch after subscribe (closes the snapshot/subscription race)
  → invalidate on event → refetch on reconnect → refetch on tab focus →
  confirm only after commit.
- Live indicator + refetch-everything-else policy: Realtime never carries
  truth, only "go look".

## Planned

- [~] **Slice D** — PostHog funnel events (no PII), in-app feedback,
  onboarding tweaks.
- [~] **Slice E** — quota policy if concentration >30%, restore drill, alert
  tuning.
- [!] **First production deploy** — provider accounts, secrets, live URL,
  managed backups, uptime monitor.
