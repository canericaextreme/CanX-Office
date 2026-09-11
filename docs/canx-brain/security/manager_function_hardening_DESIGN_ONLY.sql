-- =====================================================================
-- CanX Office — Manager function hardening
--
-- DESIGN ONLY / NOT APPLIED
-- Requires John's separate explicit approval before database execution.
-- This file is NOT a migration and must not be placed in docs/migrations/.
-- It does NOT apply migration 0004 or 0007.
-- It depends on the functions already existing from migration 0005.
--
-- Purpose: close the anonymous/public EXECUTE surface on three
-- security-definer Manager helpers and add an ownership/AAL2 guard to
-- public.manager_budget_status(_owner_id uuid).
-- =====================================================================

begin;

-- Replace public.manager_budget_status so it refuses to return any
-- owner's spend status unless the caller is the same owner and has
-- passed AAL2 verification, OR the caller is the service role.
create or replace function public.manager_budget_status(_owner_id uuid)
returns table (
  used_cents bigint,
  ceiling_cents integer,
  warn_cents integer,
  paused boolean,
  warning boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is distinct from _owner_id
       or not public.is_verified_owner()
     ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select
    coalesce(sum(u.estimated_cents::bigint), 0)::bigint,
    10000::integer,
    7500::integer,
    (coalesce(sum(u.estimated_cents::bigint), 0) >= 10000),
    (coalesce(sum(u.estimated_cents::bigint), 0) >= 7500)
  from public.ai_usage u
  where u.owner_id = _owner_id
    and u.at > date_trunc('month', now());
end;
$$;

-- Remove the default PUBLIC execute privilege that PostgreSQL grants
-- automatically on new functions. 0005 explicitly granted
-- authenticated and service_role, but it did not revoke PUBLIC first.
revoke execute on function public.ensure_manager_ai_budget(uuid) from public;
revoke execute on function public.manager_budget_status(uuid) from public;
revoke execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) from public;

-- Also remove any direct anon execute privilege if it was ever granted.
revoke execute on function public.ensure_manager_ai_budget(uuid) from anon;
revoke execute on function public.manager_budget_status(uuid) from anon;
revoke execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) from anon;

-- Re-grant to the intended callers.
grant execute on function public.ensure_manager_ai_budget(uuid) to authenticated;
grant execute on function public.manager_budget_status(uuid) to authenticated;
grant execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) to authenticated;

grant execute on function public.ensure_manager_ai_budget(uuid) to service_role;
grant execute on function public.manager_budget_status(uuid) to service_role;
grant execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) to service_role;

commit;

-- =====================================================================
-- Read-only verification queries (run after separately approved application)
--
-- Replace <role-name> with 'anon', 'authenticated', or 'service_role'.
-- Replace <owner-uuid> with a real owner UUID only in a safe test session.
-- No secret values, tokens, emails, or real row data should appear here.
-- =====================================================================

--
-- 1. Confirm execute privilege for a given role on each function.
--
-- select
--   has_function_privilege('<role-name>', 'public.manager_budget_status(uuid)', 'execute') as can_execute_budget_status,
--   has_function_privilege('<role-name>', 'public.ensure_manager_ai_budget(uuid)', 'execute') as can_execute_ensure_budget,
--   has_function_privilege('<role-name>', 'public.log_manager_change(uuid, text, text, text, jsonb, jsonb)', 'execute') as can_execute_log_change;

--
-- 2. Catalog view of privileges on the three functions.
--
-- select grantee, routine_name, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name in (
--     'manager_budget_status',
--     'ensure_manager_ai_budget',
--     'log_manager_change'
--   )
-- order by routine_name, grantee;

--
-- 3. Confirm PUBLIC and anon have no execute on these functions.
-- Expected: zero rows for grantee in ('public', 'anon').
--
-- select grantee, routine_name, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public'
--   and routine_name in (
--     'manager_budget_status',
--     'ensure_manager_ai_budget',
--     'log_manager_change'
--   )
--   and grantee in ('public', 'anon');
