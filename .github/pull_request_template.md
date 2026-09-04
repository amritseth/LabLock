## What does this PR change?

_One paragraph: what and why. Link the handbook section (e.g. §9) if the change touches booking correctness._

## Checklist

- [ ] `pnpm check` passes locally (format, lint, typecheck, tests, build)
- [ ] Migrations added are **backward-compatible** (no destructive down-migrations)
- [ ] State-changing endpoints keep the idempotency-key contract
- [ ] New env vars are documented in `.env.example` and README
- [ ] Security headers / RLS / audit coverage reviewed for the changed surface
- [ ] No PII added to analytics events, Realtime payloads, or public endpoints
- [ ] METRICS.md / NOTES.md / CHANGELOG.md updated if behaviour changed

## Test evidence

- [ ] Unit
- [ ] Integration (against local Supabase)
- [ ] Manual (describe the click path)
