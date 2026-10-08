-- Owner-requested external Office access. Ordinary Office sessions keep their
-- existing policies; OAuth clients use only the narrow bridge below.
create schema if not exists canx_private;
revoke all on schema canx_private from public, anon, authenticated;

create table canx_private.office_mcp_clients (
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.oauth_clients(id) on delete cascade,
  identity text not null check (identity in ('chatgpt', 'claude')),
  approved_at timestamptz not null default now(),
  enabled boolean not null default true,
  primary key (owner_id, client_id)
);
alter table canx_private.office_mcp_clients enable row level security;
revoke all on canx_private.office_mcp_clients from public, anon, authenticated;

-- Restrictive policies AND with the original owner policies. A direct browser
-- session has no client_id and is unchanged; OAuth cannot query raw records.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('create policy office_oauth_scoped_bridge on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''client_id'') is null) with check ((select auth.jwt()->>''client_id'') is null)', r.tablename);
  end loop;
end $$;
create policy office_oauth_scoped_bridge on storage.objects
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'client_id') is null)
  with check ((select auth.jwt()->>'client_id') is null);

-- Existing privileged helpers never accept an external OAuth client, even if
-- a later token gains AAL2. Local owner/MFA behavior is preserved.
create or replace function public.is_verified_owner()
returns boolean language sql stable security definer set search_path=public
as $$ select auth.jwt()->>'client_id' is null
  and public.has_role(auth.uid(),'owner') and public.session_aal()='aal2' $$;

create or replace function public.manager_budget_status(_owner_id uuid)
returns table(used_cents bigint, ceiling_cents integer, warn_cents integer, paused boolean, warning boolean)
language sql stable security definer set search_path=public
as $$
 select coalesce(sum(u.estimated_cents::bigint),0),10000,7500,
   coalesce(sum(u.estimated_cents::bigint),0)>=10000,
   coalesce(sum(u.estimated_cents::bigint),0)>=7500
 from public.ai_usage u where u.owner_id=_owner_id
 and u.at>date_trunc('month',now())
 having auth.jwt()->>'client_id' is null
$$;

-- The definer lives outside exposed schemas because it must inspect protected
-- Auth session/grant tables. JWT claims alone cannot prove current access.
create function canx_private.mcp_session_active()
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare uid uuid := auth.uid(); claims jsonb := auth.jwt(); cid uuid; sid uuid;
begin
 if uid is null or claims->>'iss' is distinct from 'https://gmsjjiprtulxojhkmbqb.supabase.co/auth/v1'
   or claims->>'aud' is distinct from 'authenticated' or claims->>'role' is distinct from 'authenticated'
   or coalesce((claims->>'exp')::numeric,0)<=extract(epoch from now()) then return false; end if;
 cid := (claims->>'client_id')::uuid; sid := (claims->>'session_id')::uuid;
 if cid is null or sid is null then return false; end if;
 return exists (
   select 1 from canx_private.office_mcp_clients allowed
   join auth.sessions s on s.user_id=allowed.owner_id and s.oauth_client_id=allowed.client_id
   join auth.oauth_consents consent on consent.user_id=allowed.owner_id and consent.client_id=allowed.client_id
   join auth.oauth_clients client on client.id=allowed.client_id
   where allowed.owner_id=uid and allowed.client_id=cid and allowed.enabled
     and s.id=sid and (s.not_after is null or s.not_after>now())
     and consent.revoked_at is null and client.deleted_at is null
     and exists(select 1 from public.user_roles r where r.user_id=uid and r.role='owner')
 );
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function canx_private.mcp_session_active() from public, anon, authenticated;
grant usage on schema canx_private to authenticated;
grant execute on function canx_private.mcp_session_active() to authenticated;
create function public.canx_mcp_session_active()
returns boolean language sql stable security invoker set search_path=''
as $$ select canx_private.mcp_session_active() $$;
revoke all on function public.canx_mcp_session_active() from public,anon;
grant execute on function public.canx_mcp_session_active() to authenticated;

create function canx_private.approve_mcp_client(_authorization_id text, _identity text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); auth_request auth.oauth_authorizations%rowtype;
begin
 if uid is null or not public.is_verified_owner() or _identity is null or _identity not in ('chatgpt','claude') then
   raise exception 'Owner authenticator and named client required' using errcode='42501'; end if;
 select * into auth_request from auth.oauth_authorizations a
   where a.authorization_id=_authorization_id and a.user_id=uid and a.status='approved'
   and a.expires_at>now() and a.code_challenge_method::text='s256'
   and rtrim(a.resource,'/')='https://gmsjjiprtulxojhkmbqb.supabase.co/functions/v1/office-mcp';
 if not found then raise exception 'Approved Office authorization required' using errcode='42501'; end if;
 if exists(select 1 from canx_private.office_mcp_clients c
   where c.owner_id=uid and c.client_id=auth_request.client_id and c.identity<>_identity) then
   raise exception 'Client identity cannot be silently changed' using errcode='42501'; end if;
 insert into canx_private.office_mcp_clients(owner_id,client_id,identity)
   values(uid,auth_request.client_id,_identity)
   on conflict(owner_id,client_id) do update set enabled=true,approved_at=now();
 insert into public.office_audit(owner_id,action,entity,entity_id,detail)
   values(uid,'office_mcp.authorize','oauth_client',auth_request.client_id::text,
     jsonb_build_object('identity',_identity,'permission','operational-metadata-read'));
 return auth_request.client_id;
end $$;
revoke all on function canx_private.approve_mcp_client(text,text) from public,anon,authenticated;
grant execute on function canx_private.approve_mcp_client(text,text) to authenticated;
create function public.canx_approve_mcp_client(_authorization_id text,_identity text)
returns uuid language sql security invoker set search_path=''
as $$ select canx_private.approve_mcp_client(_authorization_id,_identity) $$;
revoke all on function public.canx_approve_mcp_client(text,text) from public,anon;
grant execute on function public.canx_approve_mcp_client(text,text) to authenticated;

-- Explicit projection only: no private task text, documents, Finance or files.
create function canx_private.mcp_office_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); projects jsonb; tasks jsonb;
begin
 if not canx_private.mcp_session_active() then raise exception 'Active owner grant required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into projects from (
   select id,left(title,160) as name,updated_at from public.office_notes
   where owner_id=uid and source='Lovable project import' order by updated_at desc,id limit 200
 ) r;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into tasks from (
   select id,case when status in ('open','in_progress','waiting','done','completed','cancelled') then status else 'unknown' end as status,
   case when project ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then project else null end as project,updated_at from public.manager_tasks
   where owner_id=uid order by updated_at desc,id limit 200
 ) r;
 return jsonb_build_object('checkedAt',now(),'source','Owner-scoped saved Office operational metadata',
   'projects',projects,'tasks',tasks,
   'truncated',exists(select 1 from public.manager_tasks where owner_id=uid offset 200)
     or exists(select 1 from public.office_notes where owner_id=uid and source='Lovable project import' offset 200),
   'missingReads',jsonb_build_array('Private records, full room contents and device-only data are excluded.'),
   'buildPermission',false);
end $$;
revoke all on function canx_private.mcp_office_status() from public,anon,authenticated;
grant execute on function canx_private.mcp_office_status() to authenticated;
create function public.canx_mcp_office_status()
returns jsonb language sql stable security invoker set search_path=''
as $$ select canx_private.mcp_office_status() $$;
revoke all on function public.canx_mcp_office_status() from public,anon;
grant execute on function public.canx_mcp_office_status() to authenticated;
