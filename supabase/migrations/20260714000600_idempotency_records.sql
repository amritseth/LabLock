-- LabLock — idempotency_records (handbook §8, §10). Exactly-once-effect for
-- booking writes under retries: same key + same payload returns the stored
-- response; same key + different payload is rejected (409 key reuse).
--
--   * key is the primary key; unique on (user_id, operation, key).
--   * status: pending → committed | rejected. Terminal rows keep the exact
--     response bytes so a retry after a lost response replays them.
--   * RLS: server-only (no client access at all — no policies granted).
--   * Retention: 30 days, then archived (daily pg_cron cleanup job below).

create table public.idempotency_records (
  "key" text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('book', 'cancel', 'block', 'unblock')),
  request_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'committed', 'rejected')),
  response jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint idempotency_user_operation_key unique (user_id, operation, "key")
);

comment on table public.idempotency_records is
  'Exactly-once-effect for booking writes under retries. Server-only (RLS: no client access).';

alter table public.idempotency_records enable row level security;

-- No policies: anon/authenticated get NOTHING. Writes happen exclusively
-- inside the server-side transaction (lib/bookings.ts) as service_role.

-- Daily cleanup: rows older than 30 days are archived by the daily backup and
-- removed. A 30-day window covers any plausible retry (handbook §10
-- "Retention and cleanup trade-off").
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'idempotency-records-cleanup',
      '0 3 * * *',
      $job$delete from public.idempotency_records where created_at < now() - interval '30 days'$job$
    );
  end if;
end $$;
