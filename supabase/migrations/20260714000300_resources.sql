-- LabLock — resources (handbook §8). v1 has exactly ONE row (project-lab).
-- RLS: public read; operator-only write.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tz text not null default 'Asia/Kolkata',
  slot_length_minutes integer not null default 60 check (slot_length_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.resources is
  'A bookable lab (equipment later). v1 has exactly one row: project-lab.';

alter table public.resources enable row level security;

create policy "resources_public_read"
  on public.resources for select
  using (true);

create policy "resources_operator_write"
  on public.resources for all
  using (public.is_operator())
  with check (public.is_operator());
