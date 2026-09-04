-- LabLock — availability_events (handbook §8). The PII-free payload
-- broadcast through Supabase Realtime. Messages INVALIDATE; clients always
-- refetch the canonical view from Postgres (handbook §11).
--
--   * new_state: free | booked | blocked.
--   * NO user_id, NO email, NO booking id — the schema makes PII leakage
--     structurally impossible.
--   * RLS: all authenticated users read (Realtime authorization is the
--     table policy). No writes by clients.
--   * Retention: 7 days rolling (daily pg_cron cleanup below).

create type public.availability_state as enum ('free', 'booked', 'blocked');

create table public.availability_events (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  starts_at timestamptz not null,
  new_state public.availability_state not null,
  emitted_at timestamptz not null default now()
);

comment on table public.availability_events is
  'PII-free realtime invalidation payload. No user_id, no email. 7-day rolling retention.';

create index availability_events_emitted_at_idx on public.availability_events (emitted_at desc);
create index availability_events_resource_starts_idx on public.availability_events (resource_id, starts_at);

alter table public.availability_events enable row level security;

create policy "availability_events_authenticated_read"
  on public.availability_events for select
  using (auth.uid() is not null);

-- Publish INSERTs to Realtime. Guarded: the publication exists on every
-- Supabase project; plain-Postgres bootstrap scripts create it first.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.availability_events;
  end if;
end $$;

-- 7-day rolling cleanup.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'availability-events-cleanup',
      '0 4 * * *',
      $job$delete from public.availability_events where emitted_at < now() - interval '7 days'$job$
    );
  end if;
end $$;
