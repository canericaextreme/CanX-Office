-- PROPOSED — NOT APPLIED. Needs John's approval before it goes in supabase/migrations.
-- Tested only on an isolated Postgres engine (scripts/office-view/verify-sql.mjs), never on the live Office.
--
-- Standing, revocable, READ-ONLY viewing delegation for Claude, ChatGPT and Elsie.
--
-- How it works, in plain words:
--  * John, once, with his authenticator (AAL2), names which rooms each assistant may view.
--    That check is the "initial authenticator check". It is stored as the grant's delegation record.
--  * Each assistant gets its own dedicated sign-in identity (a "viewer" user). It is NOT an owner,
--    has no owner role, and cannot pass is_verified_owner(). It cannot write: no insert/update/delete
--    policy exists for it anywhere.
--  * A viewer identity can read only while it holds a capture session: a short (5 minute), single-use
--    row bound to ONE auth session, issued by the server under the standing grant. The database checks
--    that row on every read, so revoking or expiring it stops reads at once, whatever the token says.
--  * John's own owner account, MFA and sensitive actions are untouched.
--  * Revoking one assistant never touches another.

create schema if not exists canx_private;

-- One row per (owner, assistant): the standing grant.
create table if not exists canx_private.office_view_grants(
  owner_id uuid not null,
  assistant text not null check (assistant in ('claude','chatgpt','elsie')),
  viewer_user_id uuid not null unique,
  enabled boolean not null default true,
  rooms text[] not null,
  scopes text[] not null default array['view_room_images','read_room_information'],
  delegated_at timestamptz not null default now(),
  delegated_aal text not null check (delegated_aal = 'aal2'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(owner_id, assistant),
  check (expires_at > delegated_at and expires_at <= delegated_at + interval '90 days'),
  check (cardinality(rooms) between 1 and 24)
);

-- Short-lived capture sessions. Issued by the server only.
create table if not exists canx_private.office_view_sessions(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  assistant text not null,
  route text not null,
  purpose text not null check (purpose in ('image','information')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  auth_session_id uuid unique,
  revoked_at timestamptz,
  closed_at timestamptz
);
create index if not exists office_view_sessions_recent on canx_private.office_view_sessions(owner_id, assistant, issued_at);

-- Captured images: metadata only. Bytes live in the private bucket and are served only through the server.
create table if not exists canx_private.office_view_captures(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  assistant text not null,
  route text not null,
  room text not null,
  viewport text not null check (viewport in ('desktop','mobile')),
  ui_state text not null check (ui_state in ('default','synopsis_open')),
  build_version text not null,
  page_height integer not null check (page_height between 1 and 20000),
  image_sha256 text not null check (image_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  captured_at timestamptz not null,
  expires_at timestamptz not null,
  deleted_at timestamptz,
  revoked_at timestamptz
);

alter table canx_private.office_view_grants enable row level security;
alter table canx_private.office_view_sessions enable row level security;
alter table canx_private.office_view_captures enable row level security;
revoke all on canx_private.office_view_grants, canx_private.office_view_sessions, canx_private.office_view_captures from public, anon, authenticated;

-- The 24 rooms. The tests compare this list with the app's own identity list.
create or replace function public.canx_view_rooms() returns text[]
language sql immutable as $$ select array['/reception','/owner-desk','/brain','/idea-garage','/projects','/safe-highways','/work-board','/office-team','/build-testing','/finance','/subscriptions','/communications','/legal','/records','/skills','/systems','/health','/approvals','/blueprint','/future','/family-continuity','/analytics','/round-table','/research'] $$;

-- Room id (as stored in office_files.room) -> route.
create or replace function public.canx_view_room_route(_room text) returns text
language sql immutable as $$
  select case _room when 'project-rooms' then '/projects' else '/' || _room end $$;

-- Who is looking right now? Returns the owner id only when ALL of these hold:
--  the caller is a dedicated viewer, its grant is enabled, unrevoked and unexpired,
--  and the JWT's own auth session is bound to an open, unexpired, unrevoked capture session.
create or replace function public.canx_view_owner() returns uuid
language sql stable security definer set search_path = public, canx_private as $$
  select g.owner_id
  from canx_private.office_view_grants g
  join canx_private.office_view_sessions s
    on s.owner_id = g.owner_id and s.assistant = g.assistant
  where g.viewer_user_id = auth.uid()
    and auth.jwt()->>'client_id' is null
    and g.enabled and g.revoked_at is null and g.expires_at > now()
    and s.auth_session_id is not null
    and s.auth_session_id::text = auth.jwt()->>'session_id'
    and s.revoked_at is null and s.closed_at is null and s.expires_at > now()
  limit 1 $$;

-- May the current viewer read a room-restricted class of data?
create or replace function public.canx_view_allows(_owner uuid, _routes text[]) returns boolean
language sql stable security definer set search_path = public, canx_private as $$
  select exists(
    select 1 from canx_private.office_view_grants g
    where g.owner_id = _owner and g.viewer_user_id = auth.uid()
      and 'read_room_information' = any(g.scopes)
      and g.rooms && _routes) $$;

-- Which room does a saved note belong to? Unknown sources are general.
create or replace function public.canx_view_note_routes(_source text) returns text[]
language sql immutable as $$
  select case
    when _source = 'Legal room: document filing' then array['/legal']
    when _source in ('Lovable project import','Project register: category','Project register: plan') then array['/projects']
    when _source like 'CanX Brain:%' or _source in ('Brain index: category','Brain shelf: filing') then array['/brain']
    else public.canx_view_rooms() end $$;

grant execute on function public.canx_view_rooms(), public.canx_view_room_route(text), public.canx_view_note_routes(text) to authenticated;
revoke all on function public.canx_view_owner() from public, anon;
revoke all on function public.canx_view_allows(uuid, text[]) from public, anon;
grant execute on function public.canx_view_owner(), public.canx_view_allows(uuid, text[]) to authenticated;

-- READ-ONLY policies. SELECT only, on an explicit list. No insert/update/delete policy is created.
create policy office_view_read on public.office_notes for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, public.canx_view_note_routes(source)));
create policy office_view_read on public.office_files for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array[public.canx_view_room_route(room)]));
create policy office_view_read on public.office_links for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array[public.canx_view_room_route(room)]));
create policy office_view_read on public.manager_tasks for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, public.canx_view_rooms()));
create policy office_view_read on public.manager_approvals for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, public.canx_view_rooms()));
create policy office_view_read on public.manager_changes for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, public.canx_view_rooms()));
create policy office_view_read on public.round_tables for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array['/round-table']));
create policy office_view_read on public.finance_receipts for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array['/finance','/subscriptions','/communications']));
create policy office_view_read on public.knowledge_documents for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array['/brain']));
create policy office_view_read on public.knowledge_document_sections for select to authenticated
  using (owner_id = (select public.canx_view_owner()) and public.canx_view_allows(owner_id, array['/brain']));
-- Deliberately NOT readable by any viewer: user_roles, ai_limits, ai_usage, office_audit,
-- conversation memory, the three canx_private tables above, and the OAuth client table.

-- ---------------------------------------------------------------- owner controls

-- Grant or update. Needs the owner's authenticator (AAL2): this is the one-time delegation check.
create or replace function public.canx_view_grant_set(_assistant text, _viewer_user uuid, _rooms text[], _days integer default 30)
returns void language plpgsql security definer set search_path = public, canx_private as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_verified_owner() then
    raise exception 'Owner authenticator required to grant viewing access' using errcode = '42501'; end if;
  if _assistant is null or _assistant not in ('claude','chatgpt','elsie') then
    raise exception 'Unknown assistant' using errcode = '22023'; end if;
  if _days is null or _days < 1 or _days > 90 then
    raise exception 'Access must last between 1 and 90 days' using errcode = '22023'; end if;
  if _rooms is null or cardinality(_rooms) = 0 or not (_rooms <@ public.canx_view_rooms()) then
    raise exception 'Rooms must be known Office rooms' using errcode = '22023'; end if;
  if _viewer_user is null or _viewer_user = uid or public.has_role(_viewer_user, 'owner') then
    raise exception 'The viewer identity must be a separate, non-owner account' using errcode = '42501'; end if;
  if not exists(select 1 from auth.users where id = _viewer_user) then
    raise exception 'Viewer account does not exist' using errcode = '22023'; end if;
  if exists(select 1 from canx_private.office_view_grants g where g.viewer_user_id = _viewer_user and (g.owner_id <> uid or g.assistant <> _assistant)) then
    raise exception 'That viewer account already belongs to another assistant' using errcode = '42501'; end if;
  insert into canx_private.office_view_grants(owner_id, assistant, viewer_user_id, rooms, delegated_at, delegated_aal, expires_at)
    values (uid, _assistant, _viewer_user, (select array_agg(distinct r order by r) from unnest(_rooms) r), now(), 'aal2', now() + make_interval(days => _days))
  on conflict (owner_id, assistant) do update
    set rooms = excluded.rooms, delegated_at = now(), delegated_aal = 'aal2', expires_at = excluded.expires_at,
        enabled = true, revoked_at = null, updated_at = now(), viewer_user_id = excluded.viewer_user_id;
  insert into public.office_audit(owner_id, action, entity, entity_id, detail)
    values (uid, 'office_view.grant', 'assistant', _assistant, jsonb_build_object('rooms', _rooms, 'days', _days, 'aal', 'aal2'));
end $$;

-- Revoke one assistant. Deliberately needs only the owner's normal sign-in, so turning access OFF is never harder than turning it on.
create or replace function public.canx_view_grant_revoke(_assistant text)
returns void language plpgsql security definer set search_path = public, canx_private as $$
declare uid uuid := auth.uid(); n integer;
begin
  if uid is null or auth.jwt()->>'client_id' is not null or not public.has_role(uid, 'owner') then
    raise exception 'Owner sign-in required' using errcode = '42501'; end if;
  update canx_private.office_view_grants set enabled = false, revoked_at = now(), updated_at = now()
    where owner_id = uid and assistant = _assistant;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No such grant' using errcode = '22023'; end if;
  update canx_private.office_view_sessions set revoked_at = now() where owner_id = uid and assistant = _assistant and revoked_at is null;
  update canx_private.office_view_captures set revoked_at = now() where owner_id = uid and assistant = _assistant and revoked_at is null;
  insert into public.office_audit(owner_id, action, entity, entity_id, detail)
    values (uid, 'office_view.revoke', 'assistant', _assistant, '{}'::jsonb);
end $$;

-- Owner-facing status for the management panel. Never returns credentials.
create or replace function public.canx_view_grants_status()
returns table(assistant text, enabled boolean, rooms text[], expires_at timestamptz, delegated_at timestamptz, revoked_at timestamptz, captures_last_day bigint, last_used_at timestamptz)
language sql stable security definer set search_path = public, canx_private as $$
  select g.assistant, (g.enabled and g.revoked_at is null and g.expires_at > now()), g.rooms, g.expires_at, g.delegated_at, g.revoked_at,
    (select count(*) from canx_private.office_view_sessions s where s.owner_id = g.owner_id and s.assistant = g.assistant and s.issued_at > now() - interval '1 day'),
    (select max(s.issued_at) from canx_private.office_view_sessions s where s.owner_id = g.owner_id and s.assistant = g.assistant)
  from canx_private.office_view_grants g
  where g.owner_id = auth.uid() and auth.jwt()->>'client_id' is null and public.has_role(auth.uid(), 'owner') $$;

-- Access history for the owner (assistant views and grant changes). No images, no credentials.
create or replace function public.canx_view_history(_limit integer default 100)
returns table(at timestamptz, action text, assistant text, detail jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.action, a.entity_id, a.detail from public.office_audit a
  where a.owner_id = auth.uid() and a.action like 'office_view.%' and auth.jwt()->>'client_id' is null
    and public.has_role(auth.uid(), 'owner')
  order by a.at desc limit least(greatest(coalesce(_limit, 100), 1), 500) $$;

-- ---------------------------------------------------------------- server-only (service role)

-- Issue one capture session. Returns the session id or raises with a stable reason code.
create or replace function public.canx_view_session_issue(_owner uuid, _assistant text, _route text, _purpose text)
returns uuid language plpgsql security definer set search_path = public, canx_private as $$
declare g canx_private.office_view_grants%rowtype; sid uuid; recent integer;
begin
  select * into g from canx_private.office_view_grants where owner_id = _owner and assistant = _assistant;
  if not found then raise exception 'no_grant' using errcode = '42501'; end if;
  if not g.enabled or g.revoked_at is not null then raise exception 'revoked' using errcode = '42501'; end if;
  if g.expires_at <= now() then raise exception 'grant_expired' using errcode = '42501'; end if;
  if _purpose is null or _purpose not in ('image','information') then raise exception 'bad_purpose' using errcode = '22023'; end if;
  if not (_route = any(public.canx_view_rooms())) then raise exception 'unknown_room' using errcode = '22023'; end if;
  if not (_route = any(g.rooms)) then raise exception 'room_not_granted' using errcode = '42501'; end if;
  if _purpose = 'image' and not ('view_room_images' = any(g.scopes)) then raise exception 'wrong_permission' using errcode = '42501'; end if;
  if _purpose = 'information' and not ('read_room_information' = any(g.scopes)) then raise exception 'wrong_permission' using errcode = '42501'; end if;
  select count(*) into recent from canx_private.office_view_sessions where owner_id = _owner and assistant = _assistant and issued_at > now() - interval '1 hour';
  if recent >= 30 then raise exception 'rate_limited' using errcode = '53400'; end if;
  insert into canx_private.office_view_sessions(owner_id, assistant, route, purpose) values (_owner, _assistant, _route, _purpose) returning id into sid;
  insert into public.office_audit(owner_id, action, entity, entity_id, detail)
    values (_owner, 'office_view.session', 'assistant', _assistant, jsonb_build_object('route', _route, 'purpose', _purpose, 'outcome', 'issued'));
  return sid;
end $$;

-- Bind the freshly created auth session to the capture session. Works once; a second bind is refused (replay).
create or replace function public.canx_view_session_bind(_session uuid, _auth_session uuid)
returns void language plpgsql security definer set search_path = public, canx_private as $$
declare n integer;
begin
  update canx_private.office_view_sessions set auth_session_id = _auth_session
   where id = _session and auth_session_id is null and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'session_not_bindable' using errcode = '42501'; end if;
end $$;

create or replace function public.canx_view_session_close(_session uuid)
returns void language sql security definer set search_path = public, canx_private as $$
  update canx_private.office_view_sessions set closed_at = now() where id = _session and closed_at is null $$;

-- Record a stored capture. Refused if the grant was revoked while the capture ran.
create or replace function public.canx_view_capture_record(_session uuid, _meta jsonb, _path text)
returns uuid language plpgsql security definer set search_path = public, canx_private as $$
declare s canx_private.office_view_sessions%rowtype; g canx_private.office_view_grants%rowtype; cid uuid;
begin
  select * into s from canx_private.office_view_sessions where id = _session;
  if not found or s.purpose <> 'image' then raise exception 'unknown_session' using errcode = '22023'; end if;
  select * into g from canx_private.office_view_grants where owner_id = s.owner_id and assistant = s.assistant;
  if s.revoked_at is not null or not g.enabled or g.revoked_at is not null or g.expires_at <= now() then
    raise exception 'revoked_during_capture' using errcode = '42501'; end if;
  if _meta->>'route' <> s.route then raise exception 'wrong_route' using errcode = '22023'; end if;
  insert into canx_private.office_view_captures(owner_id, assistant, route, room, viewport, ui_state, build_version, page_height, image_sha256, storage_path, captured_at, expires_at)
  values (s.owner_id, s.assistant, s.route, _meta->>'room', _meta->'viewport'->>'name', _meta->>'state', _meta->>'buildVersion',
          (_meta->>'pageHeight')::integer, _meta->>'imageSha256', _path, (_meta->>'capturedAt')::timestamptz, now() + interval '24 hours')
  returning id into cid;
  update canx_private.office_view_sessions set closed_at = now() where id = _session and closed_at is null;
  insert into public.office_audit(owner_id, action, entity, entity_id, detail)
    values (s.owner_id, 'office_view.capture', 'assistant', s.assistant, jsonb_build_object('route', s.route, 'capture', cid, 'outcome', 'stored'));
  return cid;
end $$;

-- Fetch a stored capture for ONE assistant. Wrong assistant, revoked grant, expired or deleted capture: refused.
create or replace function public.canx_view_capture_fetch(_owner uuid, _assistant text, _capture uuid)
returns table(storage_path text, route text, room text, viewport text, ui_state text, build_version text, page_height integer, image_sha256 text, captured_at timestamptz)
language plpgsql security definer set search_path = public, canx_private as $$
declare g canx_private.office_view_grants%rowtype;
begin
  select * into g from canx_private.office_view_grants where owner_id = _owner and assistant = _assistant;
  if not found then raise exception 'no_grant' using errcode = '42501'; end if;
  if not g.enabled or g.revoked_at is not null then raise exception 'revoked' using errcode = '42501'; end if;
  if g.expires_at <= now() then raise exception 'grant_expired' using errcode = '42501'; end if;
  return query select c.storage_path, c.route, c.room, c.viewport, c.ui_state, c.build_version, c.page_height, c.image_sha256, c.captured_at
    from canx_private.office_view_captures c
   where c.id = _capture and c.owner_id = _owner and c.assistant = _assistant
     and c.deleted_at is null and c.revoked_at is null and c.expires_at > now() and c.route = any(g.rooms);
  if not found then raise exception 'capture_unavailable' using errcode = '42501'; end if;
end $$;

-- Retention: returns paths to delete from the private bucket and marks them deleted.
create or replace function public.canx_view_capture_purge()
returns table(storage_path text) language sql security definer set search_path = public, canx_private as $$
  update canx_private.office_view_captures c set deleted_at = now()
   where c.deleted_at is null and (c.expires_at <= now() or c.revoked_at is not null)
  returning c.storage_path $$;

-- Owner controls: signed-in owner only (never an OAuth client, never a viewer).
revoke all on function public.canx_view_grant_set(text, uuid, text[], integer), public.canx_view_grant_revoke(text), public.canx_view_grants_status(), public.canx_view_history(integer) from public, anon;
grant execute on function public.canx_view_grant_set(text, uuid, text[], integer), public.canx_view_grant_revoke(text), public.canx_view_grants_status(), public.canx_view_history(integer) to authenticated;
-- Server-only.
revoke all on function public.canx_view_session_issue(uuid, text, text, text), public.canx_view_session_bind(uuid, uuid), public.canx_view_session_close(uuid),
  public.canx_view_capture_record(uuid, jsonb, text), public.canx_view_capture_fetch(uuid, text, uuid), public.canx_view_capture_purge() from public, anon, authenticated;
grant execute on function public.canx_view_session_issue(uuid, text, text, text), public.canx_view_session_bind(uuid, uuid), public.canx_view_session_close(uuid),
  public.canx_view_capture_record(uuid, jsonb, text), public.canx_view_capture_fetch(uuid, text, uuid), public.canx_view_capture_purge() to service_role;

-- Private bucket for capture images. No policy for authenticated users: only the server (service role) touches it.
insert into storage.buckets(id, name, public) values ('office-captures', 'office-captures', false) on conflict (id) do nothing;
