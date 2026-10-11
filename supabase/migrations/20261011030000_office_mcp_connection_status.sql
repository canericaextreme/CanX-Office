-- Read-only: is each approved assistant (ChatGPT, Claude) actually signed in right now?
-- Supabase Auth deletes every aal1 session for a user whenever that user verifies an
-- authenticator code (supabase/auth internal/api/mfa.go, InvalidateSessionsWithAALLessThan).
-- OAuth client sessions are created at aal1, so each owner authenticator code signs the
-- assistants out while their approval and consent rows stay. This shows that difference.
-- It never changes, revokes or reconnects anything. Owner's own browser session only.
create or replace function public.canx_mcp_connection_status()
returns table(identity text, enabled boolean, consent_active boolean, live_sessions integer, last_active_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or auth.jwt()->>'client_id' is not null or not public.has_role(auth.uid(), 'owner') then
    raise exception 'Owner sign-in required' using errcode = '42501'; end if;
  return query
  select c.identity, c.enabled,
    exists(select 1 from auth.oauth_consents k where k.user_id = c.owner_id and k.client_id = c.client_id and k.revoked_at is null),
    (select count(*)::integer from auth.sessions s where s.user_id = c.owner_id and s.oauth_client_id = c.client_id and (s.not_after is null or s.not_after > now())),
    (select max(s.updated_at) from auth.sessions s where s.user_id = c.owner_id and s.oauth_client_id = c.client_id)
  from canx_private.office_mcp_clients c
  where c.owner_id = auth.uid()
  order by c.identity;
end $$;
revoke all on function public.canx_mcp_connection_status() from public, anon;
grant execute on function public.canx_mcp_connection_status() to authenticated;
