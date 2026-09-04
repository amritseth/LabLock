# LabLock — Operational runbook

Operational procedures for LabLock. Section numbering mirrors the handbook §18.

- **Escalation:** the operator (lab in-charge) is the on-call for the pilot.
- **Status page:** `/api/health` (fail-closed; 503 = alert). Better Stack polls
  it at 3-minute cadence.
- **Correlation key:** `x-request-id` — echoed by every API response, carried
  into Pino logs (Vercel), Sentry extras, and `audit_events.request_id`.

## Environment reference

| Variable                                                                   | Where                                        | Public?             |
| -------------------------------------------------------------------------- | -------------------------------------------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`                | Vercel env (production + preview)            | by design           |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`                        | Vercel env                                   | by design           |
| `SUPABASE_SERVICE_ROLE_KEY`                                                | **GitHub `production` environment + Vercel** | **never** → browser |
| `SUPABASE_DB_URL`                                                          | **GitHub `production` environment + Vercel** | **never** → browser |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`                        | GitHub `production` environment              | never               |
| `AUDIT_PEPPER`                                                             | Vercel env (server only)                     | never               |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_PROD_DOMAIN` | GitHub `production` environment secrets      | never               |

`.env.example` contains **public-only placeholders** plus a server-only marker.

## Normal deployment

1. Open PR. Confirm app checks **and** the database job pass (CI: format, lint,
   typecheck, test, build + `supabase db reset --local` + `db lint --local`).
2. Confirm migrations are **additive / backward-compatible** (no destructive
   down-migrations — handbooks §16).
3. Merge to main. CI reruns on the merge commit.
4. Deploy runs automatically (`workflow_run` gate): verify secrets →
   `supabase db push --db-url` (**migration-first**) → `vercel build --prod` →
   `vercel deploy --prebuilt --prod` → smoke `curl --fail --retry 6
--retry-all-errors --retry-delay 5 https://<domain>/api/health`.
5. Click the production URL: verify landing; (pilot) sign in, book a smoke
   slot, cancel it.
6. Check Sentry for a release spike; Better Stack for health.

## Application rollback

1. In Vercel, find the last known-good deployment.
2. Promote/roll back to it (same immutable build).
3. `curl https://<domain>/api/health`; run the smoke steps.
4. Mark the bad release in Sentry; open a fix-forward PR.
5. **Target: under 5 minutes.**
6. Never roll back the database destructively — repair forward.

## Incident 1 — Site or health endpoint down

- **Signal:** Better Stack alert, `/api/health` 503, Vercel deploy failure.
- **Severity:** P1 if user-facing.
- **First five actions:**
  1. Check landing vs health separately (app process vs DB probe).
  2. Check Vercel + Supabase status pages.
  3. Check latest deploy output + smoke logs.
  4. If the deploy caused it → roll back the app (not the DB).
  5. If the DB probe alone fails → follow Incident 2. Do **not** redeploy
     blindly.
- **What NOT to do:** redeploy blindly; "quick-fix" the health endpoint to
  return 200.
- **Recovery verification:** two successful external health checks.
- **Follow-up:** post-incident note; add a regression test.

## Incident 2 — Database, auth, or email provider degraded

- **Signal:** health 503, login failures, reset emails missing, elevated
  Supabase latency.
- **Severity:** P1 if booking or login is blocked.
- **First five actions:**
  1. Identify the failing dependency (DB / auth / SMTP).
  2. Check provider status + protected logs.
  3. DB degradation → stop non-essential operator writes; bound retries.
  4. **Do not** switch to a local or unbacked DB.
  5. Email-only failure → keep existing sessions; tell new users email is
     delayed.
- **What NOT to do:** switch to a local DB; claim a booking succeeded when
  Supabase is down.
- **Recovery verification:** health + auth + smoke booking/cancel.
- **Follow-up:** confirm backup timestamps; consider provider SLA discussion.

## Incident 3 — Booking dispute or suspected double booking

- **Signal:** user reports two confirmed bookings for the same slot.
- **Severity:** any confirmed invariant breach is **severity 1 (P0)** — the
  worst-case scenario for this system.
- **First five actions:**
  1. **Do not delete or edit disputed records.**
  2. Block the affected slot (operator console).
  3. Preserve bookings, audit events, request IDs, idempotency records, Sentry
     events.
  4. Query for >1 confirmed booking for the same resource + start time.
  5. Distinguish stale UI from real duplicate rows.
- **What NOT to do:** manually edit booking rows; resolve the alert until the
  invariant is proven intact.
- **Recovery verification:** the race test reproduces the path; invariant
  holds.
- **Follow-up:** record user impact in METRICS.md + NOTES.md; add a regression
  test.

## Backup and restore

- **Weekly:** check automatic backup success (Supabase Pro, 7-day retention).
- **Monthly (beta):** restore drill into a non-production project.
- **Before every destructive migration:** verify the latest backup timestamp.
- **A backup is not working until a restore has been tested.**

## Security checklist for launch

- [ ] `main` protected; CI required.
- [ ] GitHub `production` environment requires owner approval.
- [ ] Vercel production project in **Mumbai** (`bom1`), connected.
- [ ] Production and Preview envs separated.
- [ ] Supabase Pro in Mumbai.
- [ ] Daily backups succeeding, 7-day retention.
- [ ] Restore drill performed into a non-production project.
- [ ] Resend domain: SPF, DKIM, DMARC.
- [ ] Auth redirect allowlist = local + preview + production only.
- [ ] Google OAuth consent + callback URLs correct.
- [ ] Auth rate limits + Turnstile configured.
- [ ] Sentry receives a tagged test error.
- [ ] Better Stack alerts on forced non-200 health.
- [ ] PostHog receives test events, no email/PII.
- [ ] Privacy notice names the operator and deletion contact.
- [ ] Custom domain with HTTPS verified.
- [ ] Operator role assigned: `update public.profiles set role='operator'
where id = '<auth user id>';`

## Release bookkeeping

- Release id = first 12 chars of `VERCEL_GIT_COMMIT_SHA` (health + Sentry).
- Update CHANGELOG.md and METRICS.md on every user-visible change.
