#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# LabLock — local database bootstrap (DEV/CI ONLY)
#
# Replicates just enough of a Supabase project on plain PostgreSQL 17 so the
# migrations, RLS policies and the booking transaction can be verified without
# Docker/Supabase CLI: roles, the auth schema stub (auth.users, auth.uid()),
# the realtime publication, then ALL migrations in order, then seed data.
#
#   bash scripts/prepare-local-db.sh [dbname]
#
# Requires: a running Postgres 17 + psql access as a superuser (env PGURL or
# defaults to postgres://postgres:postgres@127.0.0.1:5432).
#
# This is NEVER used in production. Production applies migrations with
# `supabase db push --db-url` inside the deploy workflow (migration-first,
# backward-compatible — see .github/workflows/deploy.yml).
# ---------------------------------------------------------------------------
set -euo pipefail

DB_NAME="${1:-lablock_test}"
PGURL="${PGURL:-postgres://postgres:postgres@127.0.0.1:5432}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql_super() { psql "$PGURL/$DB_NAME" -v ON_ERROR_STOP=1 -q; }

echo "==> Creating database $DB_NAME (idempotent)"
psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -qc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 ||
  psql "$PGURL/postgres" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DB_NAME"

echo "==> Applying local Supabase stand-in (roles, auth stub, realtime publication)"
psql_super <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- auth.uid(): the Supabase JWT subject. In the local stand-in there is no
-- JWT, so it returns NULL; RLS policies are exercised on the real project.
create or replace function auth.uid() returns uuid language sql stable as
$$ select null::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

create publication supabase_realtime;
SQL

echo "==> Applying migrations in order"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  psql_super < "$f"
done

echo "==> Seeding"
psql_super < "$ROOT/supabase/seed.sql"

echo "==> Done. Connect with: $PGURL/$DB_NAME"
echo "    Then: TEST_DATABASE_URL=$PGURL/$DB_NAME pnpm test:integration"
