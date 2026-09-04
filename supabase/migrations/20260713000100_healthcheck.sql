-- LabLock — healthcheck RPC (Slice A; the ONLY object in the original
-- production schema, handbook §8.A).
--
-- Security model (handbook §8, §13):
--   * SECURITY DEFINER — runs with owner privileges so the unauthenticated
--     function body never needs client-password roles.
--   * Revoked from PUBLIC / anon / authenticated; executable by service_role
--     only. The client never calls this; /api/health does, server-side.
--   * Returns a jsonb envelope: { status, checked_at } — no connection
--     strings, schema names, versions, or provider details.

create or replace function public.healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  return jsonb_build_object(
    'status', 'ok',
    'checked_at', now()
  );
end;
$$;

revoke all on function public.healthcheck() from public;
revoke all on function public.healthcheck() from anon;
revoke all on function public.healthcheck() from authenticated;
grant execute on function public.healthcheck() to service_role;
