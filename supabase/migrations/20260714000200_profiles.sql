-- LabLock — profiles (handbook §8: app-level user metadata, mirrors
-- auth.users). DESIGNED → implemented in Slice B.

create type public.app_role as enum ('student', 'operator');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'App-level user metadata mirroring Supabase Auth. RLS: users read own row; operators read all.';

-- Authorization helper used by RLS policies everywhere: is the current user
-- the manually-assigned operator? SECURITY DEFINER so policies can read
-- profiles without recursion. Declared AFTER the table (the body is
-- validated at create time).
create or replace function public.is_operator()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'operator'
  );
$$;

grant execute on function public.is_operator() to authenticated, service_role;

-- Auto-provision a profile when a user row is created (works for operator
-- invites and OAuth flows; anonymous sign-ins are disabled).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      null
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_own_row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_operator_read_all"
  on public.profiles for select
  using (public.is_operator());

-- Profile writes happen through the service role / auth trigger; no client
-- insert/update/delete policies are granted.
