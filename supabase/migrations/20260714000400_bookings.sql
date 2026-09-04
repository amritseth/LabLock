-- LabLock — bookings (handbook §8, §9). THE TRUTH TABLE.
--
-- The correctness invariant, owned by Postgres — no application code can
-- bypass it:
--
--   CREATE UNIQUE INDEX bookings_one_confirmed_per_slot
--   ON bookings (resource_id, starts_at) WHERE status = 'confirmed';
--
-- Cancelled bookings do not occupy the slot. Concurrent inserts on the same
-- (resource_id, starts_at) with status 'confirmed' resolve to exactly one
-- winner; every loser gets a 23505 unique_violation that the API maps to
-- HTTP 409 slot_already_confirmed (handbook §9 example responses).

create type public.booking_status as enum ('confirmed', 'cancelled');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  status public.booking_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text
);

comment on table public.bookings is
  'One confirmed or cancelled reservation — THE TRUTH TABLE.';

-- The correctness wall (handbook §9 "The planned database constraint").
create unique index bookings_one_confirmed_per_slot
  on public.bookings (resource_id, starts_at)
  where status = 'confirmed';

create index bookings_user_idx on public.bookings (user_id, starts_at desc);
create index bookings_starts_at_idx on public.bookings (starts_at);

alter table public.bookings enable row level security;

-- Users read their own rows (all columns).
create policy "bookings_own_row"
  on public.bookings for select
  using (auth.uid() = user_id);

-- Operators read all booking rows.
create policy "bookings_operator_read_all"
  on public.bookings for select
  using (public.is_operator());

-- The occupancy-only channel is GET /api/availability (server-side,
-- service-role): other students see free/booked/blocked, never booker
-- identity. No client insert/update policy exists — all writes happen inside
-- the server-side transaction (lib/bookings.ts) with the service role.
