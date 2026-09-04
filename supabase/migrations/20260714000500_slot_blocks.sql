-- LabLock — slot_blocks (handbook §8). Operator-marked maintenance or
-- blackout slots. Cannot be booked. Unique on (resource_id, starts_at).
-- RLS: public read; operator-only write.

create table public.slot_blocks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  starts_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint slot_blocks_one_per_resource_start unique (resource_id, starts_at)
);

comment on table public.slot_blocks is
  'Operator-marked maintenance or blackout slots; cannot be booked.';

alter table public.slot_blocks enable row level security;

create policy "slot_blocks_public_read"
  on public.slot_blocks for select
  using (true);

create policy "slot_blocks_operator_write"
  on public.slot_blocks for all
  using (public.is_operator())
  with check (public.is_operator());
