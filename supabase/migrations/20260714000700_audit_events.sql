-- LabLock — audit_events (handbook §8). Immutable record of every
-- state-changing action for dispute resolution: 'who cancelled what, when,
-- with what request ID' must always be answerable.
--
--   * hashed_user_ref: SHA-256(user_id || AUDIT_PEPPER) — the trail can be
--     matched to a real user with the pepper, but the audit table itself
--     doesn't carry raw identifiers.
--   * RLS: operator-only read; service-role write (no client write policy).
--   * Retention: 1 year minimum; 90 days hot, then cold storage (archive).

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'cancelled', 'blocked', 'unblocked')),
  request_id text not null,
  hashed_user_ref text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Immutable record of every state-changing action for dispute resolution.';

create index audit_events_booking_idx on public.audit_events (booking_id);
create index audit_events_created_at_idx on public.audit_events (created_at desc);

alter table public.audit_events enable row level security;

create policy "audit_events_operator_read"
  on public.audit_events for select
  using (public.is_operator());

-- Append-only by design: no insert/update/delete policies for clients. The
-- server inserts through the service role. (If your project grants the
-- service role unrestricted access, that is intended.)
