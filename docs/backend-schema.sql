-- CanX Office — proposed backend schema. REFERENCE ONLY.
-- DO NOT APPLY. No backend has been chosen, created, or connected.
-- Intended target: a CanX-owned Supabase project, once John approves one.
--
-- Owner MFA is mandatory before this schema is used in anger: enable TOTP in
-- Supabase Auth, enrol the owner account, and require aal2 for owner-only
-- policies. Deny by default; grant the narrowest thing that works.

-- 1. Roles live in their own table. Never on a profile row.
create type public.app_role as enum ('owner', 'staff', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create policy "Users read their own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

-- 2. Internal office tasks and decisions (currently device-only localStorage).
create table public.office_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('task', 'decision')),
  title text not null,
  detail text not null default '',
  assigned_to text not null default '',
  source text not null default 'John',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.office_notes to authenticated;
grant all on public.office_notes to service_role;

alter table public.office_notes enable row level security;

create policy "Owners manage their notes"
on public.office_notes for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- 3. Round table records (currently device-only localStorage).
create table public.round_tables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  meeting_date date not null,
  start_time time,                       -- null means deliberately unset
  timezone text not null default 'America/Dawson_Creek',
  chair text not null default '',
  coordinator text not null default '',
  document jsonb not null default '{}'::jsonb,  -- agenda, roles, notes, decisions, actions
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.round_tables to authenticated;
grant all on public.round_tables to service_role;

alter table public.round_tables enable row level security;

create policy "Owners manage their round tables"
on public.round_tables for all to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- 4. Append-only audit trail. History is never overwritten.
create table public.office_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  subject text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.office_audit to authenticated;
grant all on public.office_audit to service_role;

alter table public.office_audit enable row level security;

create policy "Owner reads the audit trail"
on public.office_audit for select to authenticated
using (public.has_role(auth.uid(), 'owner'));

create policy "Signed-in users append their own audit rows"
on public.office_audit for insert to authenticated
with check (auth.uid() = actor_id);

-- No update or delete policy on office_audit: rows are append-only by omission.

-- 5. Before this is used for real, confirm and record evidence for:
--    * owner MFA enrolled and enforced,
--    * automatic backups enabled, with a restore actually tested,
--    * export of every table verified,
--    * a written rebuild path outside Lovable.
