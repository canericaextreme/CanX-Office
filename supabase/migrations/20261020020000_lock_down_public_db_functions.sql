-- Lock down four database functions that anyone could call without signing in
-- (Supabase security advisor, 19 Oct 2026). Approved by John, 19 Oct 2026.
--
-- What each one was, and what changes:
--  * manager_budget_status(_owner_id): a REAL LEAK. It had no owner check, so
--    anyone, signed in or not, who knew John's account id could read his
--    month-to-date AI spend. Now it answers only the signed-in owner about his
--    own account (same rule as before for John; strangers and other accounts
--    get nothing). No two-step requirement is added, so the Analytics meter
--    and the AI budget meter keep working exactly as today.
--  * log_manager_change(...) and ensure_manager_ai_budget(_owner_id): already
--    refused anyone but the verified owner inside the function, so nothing
--    could be faked. Anonymous callers simply can't reach them any more.
--  * rls_auto_enable(): the helper behind the "turn on row security for new
--    tables" event trigger. Nobody needs to call it directly; the trigger keeps
--    working.
-- Signed-in owner calls (the Office server with John's sign-in) are unchanged.
-- Nothing here touches Elsie's chat, the builders, or any table.

REVOKE EXECUTE ON FUNCTION public.ensure_manager_ai_budget(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_manager_change(uuid, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manager_budget_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Same body as the live definition (read 20 Oct 2026), plus the owner check in HAVING.
CREATE OR REPLACE FUNCTION public.manager_budget_status(_owner_id uuid)
 RETURNS TABLE(used_cents bigint, ceiling_cents integer, warn_cents integer, paused boolean, warning boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select coalesce(sum(u.estimated_cents::bigint),0),10000,7500,
   coalesce(sum(u.estimated_cents::bigint),0)>=10000,
   coalesce(sum(u.estimated_cents::bigint),0)>=7500
 from public.ai_usage u where u.owner_id=_owner_id
 and u.at>date_trunc('month',now())
 having auth.jwt()->>'client_id' is null
   and auth.uid() is not distinct from _owner_id
   and public.has_role(auth.uid(), 'owner')
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_manager_ai_budget(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_manager_change(uuid, text, text, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manager_budget_status(uuid) TO authenticated, service_role;
