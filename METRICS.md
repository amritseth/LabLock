# LabLock — Metrics

> **Honesty rule:** a rate with a zero denominator is **N/A**, not 0%. We never
> invent numbers. Every metric below is updated from real product evidence; a
> polished repo with zero users is a failed pilot, and these numbers are how we
> know which.

## Current metrics (as of 13 July 2026 — pre-pilot)

| Metric | Current | Notes |
| --- | --- | --- |
| Invited users | **0** | Pilot allowlist not created yet |
| Signed-up users | **0** | Auth connected after Slice B |
| Activated users | **0** | Activation = verified email + first availability view |
| Activation rate | **N/A** | Denominator (signed-up) = 0 |
| 7-day retention | **N/A** | No matured cohorts |
| Successful bookings | **0** | Booking transaction exists; no users yet |
| Booking success rate | **N/A** | 0 / 0 is undefined |
| Booking API p95 | **N/A** | No production traffic |
| Connected-client update p95 | **N/A** | No production Realtime traffic |
| Reconnect convergence p95 | **N/A** | No production Realtime traffic |
| Double bookings | **0** | The only metric that is genuinely 0 and proud of it (invariant tests: 20-race, cancel/book race) |
| Invariant test suite | **15/15 passing** | `tests/integration` against PostgreSQL 17 |
| Unit tests | **32 passing** | health, slots, availability, validation |

### Verification evidence (not user metrics — repository evidence)

| What | Evidence |
| --- | --- |
| `pnpm check` green (format, lint, typecheck, unit tests, production build) | CI contract — run locally on every change |
| Migrations apply clean + lint | `supabase db reset --local` + `supabase db lint --local --level warning` (CI job) |
| 20 users one slot → exactly one winner | `tests/integration/bookings.integration.test.ts` |
| Idempotency matrix (same key 20×, reuse 409, lost-response replay, no-key 400) | same file |
| Rollback atomicity (no partial state) | same file |

## Initial targets (NOT current results — require production evidence)

| Measure | Target |
| --- | --- |
| Signup → activation | ≥ 70% |
| Median time to first booking | < 60 seconds |
| 7-day retention | ≥ 35% |
| Booking transaction p95 | < 800 ms |
| Connected-client update p95 | < 2 seconds |
| Reconnect convergence | < 3 seconds |
| Double bookings | **0** (any occurrence = severity P0) |
| One user holding prime slots | < 30% (quota trigger) |

## Planned funnel (Slice D — PostHog)

`landing_cta_clicked → signup_started → signup_completed → availability_viewed
→ booking_started → booking_succeeded → day-7 return`

Event taxonomy contract (§15.1): **no PII** — email, name, user_id and
booking_id are prohibited properties; PostHog receives resource_id, dates,
latency and reason codes only.

## Weekly update ritual (every Monday)

1. Read the signup-to-booking funnel by cohort.
2. Read 7-day retention for matured cohorts only.
3. Review booking failures by safe reason code.
4. Review Sentry events and uptime incidents.
5. Read every feedback item.
6. Add **one** evidence-backed product or reliability change to the learning
   log below. If no change is justified, write "no change" and why. Do not
   invent work to look active.

## Learning log

| Week | Evidence | Change |
| --- | --- | --- |
| 2026-07-13 | Pre-pilot; nothing to measure | **No change** — pilot not open; metrics stay 0/N/A by definition |
