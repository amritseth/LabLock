# LabLock — Security

Defense in depth: input validation at every boundary · parameterized queries ·
RLS on every table · role checks in routes · idempotency on state changes ·
database constraints for booking invariants. **The service-role key never
reaches the browser.**

> Pilots fail on boring things first: leaked keys, missing headers, tokens in
> localStorage. This file is where those boring things are checked.

## Threat model

| Threat                                | Entry point                     | Prevention                                                                                                                                          | Detection                            |
| ------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| SQL injection                         | Any input reaching a query      | Parameterized queries only; Zod at the boundary (`lib/validation.ts`)                                                                               | Sentry anomaly; audit review         |
| Broken access control                 | Missing role check              | RLS on every table + role check in route; integration tests                                                                                         | Audit review; Sentry                 |
| CSRF                                  | Forged state-changing request   | SameSite httpOnly cookies; idempotency keys; origin-scoped OAuth redirect allowlist                                                                 | Audit mismatch                       |
| XSS                                   | Unsanitized user input rendered | React auto-escaping; CSP `script-src 'self' 'unsafe-inline'`; no dangerouslySetInnerHTML                                                            | CSP report; Sentry                   |
| Credential leakage                    | Committed `.env`, leaked token  | `.gitignore`; secret manager (Vercel + GitHub environments); rotation playbook                                                                      | Secret scanning; access review       |
| Service-role exposure                 | Client bundle, leaked env       | `server-only` imports; no `NEXT_PUBLIC_` on server keys; `lib/supabase/client.ts` is anon-only                                                      | Access audit; anomaly                |
| Brute-force auth                      | Login endpoint                  | Supabase rate limits (`30/5 min per IP`), Turnstile on signup/reset, strong password policy                                                         | Auth log spike                       |
| Booking automation                    | Scripted booking requests       | Auth required; idempotency keys; Realtime events never grant truth                                                                                  | Funnel anomaly; concentration metric |
| Duplicate requests                    | Double-click, retry             | Idempotency keys + partial unique index                                                                                                             | Audit log                            |
| Realtime PII leakage                  | Realtime payload                | `availability_events` has **no** `user_id`/email by schema; RLS = authenticated read                                                                | Code review; realtime log            |
| Dependency vulnerabilities            | Transitive npm package          | Pinned exact versions, frozen lockfile, Dependabot weekly, `pnpm audit`                                                                             | Dependabot alerts                    |
| Malicious PR accessing deploy secrets | PR with modified workflow       | Actions pinned by **SHA**; `deploy.yml` gated to `workflow_run` conclusion success + push + `main` + same repository; `permissions: contents: read` | CI log review; secret scanning       |

## Implemented controls

### 1. Redaction in structured logs (`lib/logger.ts`)

Pino `redact` paths — censored **before** the line is written:
`authorization`, `cookie`, `password`, `token`, `idempotencyKey`, `email`,
`serviceRoleKey` (+ nested variants).

### 2. Supabase healthcheck RPC (`supabase/migrations/20260713000100_healthcheck.sql`)

`SECURITY DEFINER` · revoked from `public`, `anon`, `authenticated` · granted to
`service_role` only. Callable by the server probe alone.

### 3. RLS matrix (no client write policies exist)

| Table                 | Read                                                              | Write                             |
| --------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `profiles`            | own row; operator all                                             | service role / auth trigger       |
| `resources`           | public                                                            | operator                          |
| `bookings`            | own rows; operator all (occupancy-only via API, no client insert) | server transaction (service role) |
| `slot_blocks`         | public                                                            | operator                          |
| `idempotency_records` | **none — server-only, no policies**                               | server transaction                |
| `audit_events`        | operator only                                                     | server transaction                |
| `availability_events` | authenticated (PII-free payload)                                  | server transaction                |

### 4. Auth (§12)

- Google OAuth with **PKCE**; `state` validated by Supabase.
- Email OTP fallback (1-hour expiry) with `shouldCreateUser: false` → the
  operator controls every account (invite-only; `enable_signup = false`).
- **httpOnly, same-site cookie sessions — no tokens in localStorage.**
- Verified email required before first booking.
- Rate limits: `sign_in_sign_ups` 30/5 min/IP; `token_verifications` 30/5 min.

### 5. Headers (`next.config.ts`)

CSP (`default-src 'self'`; `script-src 'self' 'unsafe-inline'` + PostHog;
`connect-src` = Supabase/Sentry/PostHog allowlist; `frame-ancestors 'none'`) ·
HSTS (2y, preload) · COOP same-origin · `X-Frame-Options: DENY` ·
`Referrer-Policy: strict-origin-when-cross-origin` · `X-Content-Type-Options:
nosniff` · Permissions-Policy (no camera/mic/geo/payment).

### 6. CI/CD hardening (`ci.yml`, `deploy.yml`)

- Every `uses:` pinned to a **commit SHA** (checkout v4.2.2, setup-node v4.4.0,
  pnpm/action-setup v4.3.0, setup-cli v1.7.0, upload-artifact v4.6.2).
- `pnpm install --frozen-lockfile` — the lockfile is the contract.
- Deploy: `workflow_run` gate (`conclusion == success && event == push &&
head_branch == main && head_repository == this repo`), `environment:
production` with owner approval, `permissions: contents: read` (a forked PR
  cannot reach deployment secrets).

## Secret flow

```
┌─ Deployment secrets (GitHub `production` env, owner-approved) ─────────┐
│ VERCEL_TOKEN · VERCEL_ORG_ID · VERCEL_PROJECT_ID · SUPABASE_DB_URL      │
│ SENTRY_AUTH_TOKEN · SENTRY_ORG · SENTRY_PROJECT · VERCEL_PROD_DOMAIN    │
└──────┬─────────────────────────────────────────────────────────────────┘
       │ read only by deploy.yml (never by CI, never by forks)
       ▼
┌─ Runtime secrets (Vercel env, server-only) ───────────────────────────┐
│ SUPABASE_SERVICE_ROLE_KEY · SUPABASE_DB_URL · AUDIT_PEPPER · LOG_LEVEL │
└──────┬─────────────────────────────────────────────────────────────────┘
       │ imported by lib/ only via requireEnv()/optionalEnv()
       ▼
┌─ Public-by-design (NEXT_PUBLIC_*, RLS-protected) ─────────────────────┐
│ NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY              │
│ NEXT_PUBLIC_SENTRY_DSN · NEXT_PUBLIC_POSTHOG_KEY                       │
└────────────────────────────────────────────────────────────────────────┘
```

## PII boundaries

- **Never to PostHog:** email, name, `user_id`, `booking_id` (taxonomy in
  METRICS.md §Planned funnel).
- **Never to other students:** booker identity, user ids, emails. Occupancy is
  `free/booked/blocked` only.
- **Never to logs:** tokens, passwords, emails, cookies, keys (redaction list
  above).
- **Available to the operator only:** audit trail (with `hashed_user_ref =
SHA-256(user_id ‖ AUDIT_PEPPER)`), all booking rows.
- Sentry: `sendDefaultPii: false` everywhere.
- PostHog: bundled `posthog-js` (no third-party script), **autocapture off,
  session recording off**, and a per-event property whitelist in
  `lib/analytics.ts` — email, name, `user_id`, `booking_id` are prohibited by
  taxonomy and dropped before dispatch.

## Vulnerability response

1. Dependabot opens a pinned-version PR weekly (npm + GitHub Actions).
2. Accept only after `pnpm check` + `pnpm audit` review — same CI gate as
   production.
3. Secrets never enter PRs; `.env.example` is public-only by design.
