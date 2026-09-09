-- =====================================================================
-- CanX Office — core schema for a CanX-OWNED Supabase project.
--
-- STATUS: NOT APPLIED. No Supabase project has been identified yet.
-- This file is reference SQL only. Applying it does not create sign-in,
-- does not enable AI, and does not prove that backups work.
--
-- Apply order: 0001 (this file), then 0002_ai_limits.sql.
-- Run these in the SQL editor of the CanX-owned project once it exists.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Deliberate minimum grants. This project has automatic exposure of
--    new tables switched OFF, so nothing below is reachable unless it is
--    granted here by name. Schema usage is granted; blanket default
--    privileges are NOT, on purpose.
-- ---------------------------------------------------------------------

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
-- No grant to anon anywhere in this file. Nothing here is public.



-- ---------------------------------------------------------------------
-- 1. Roles. Roles are NEVER stored on a profile row and are never granted
--    from the browser. The owner role is inserted once, by hand, in the
--    SQL editor during setup (see docs/office-manager-setup.md).
-- ---------------------------------------------------------------------

create type public.app_role as enum ('owner', 'admin', 'member');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users read their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);
-- Deliberately no insert/update/delete policy: roles are changed only with
-- the service role, in the dashboard, by John.

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- Assurance level of the CURRENT request, from the verified JWT.
create or replace function public.session_aal()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'aal', 'aal1')
$$;

-- Owner AND two-step verified. Every protected policy uses this.
create or replace function public.is_verified_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'owner') and public.session_aal() = 'aal2'
$$;

grant execute on function public.session_aal() to authenticated;
grant execute on function public.is_verified_owner() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Office notes (tasks and decisions). Provenance travels with the row.
-- ---------------------------------------------------------------------

create table public.office_notes (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('task', 'decision')),
  title text not null check (char_length(title) between 1 and 300),
  detail text not null default '' check (char_length(detail) <= 2000),
  owner_name text not null default '',
  provenance text not null default 'john' check (provenance in ('john', 'ai-proposal', 'sample')),
  source text not null default 'John',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.office_notes to authenticated;
grant all on public.office_notes to service_role;

alter table public.office_notes enable row level security;

create policy "Verified owner reads own notes"
  on public.office_notes for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner writes own notes"
  on public.office_notes for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner updates own notes"
  on public.office_notes for update to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner())
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner deletes own notes"
  on public.office_notes for delete to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

-- ---------------------------------------------------------------------
-- 3. Round table documents.
-- ---------------------------------------------------------------------

create table public.round_tables (
  key text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.round_tables to authenticated;
grant all on public.round_tables to service_role;

alter table public.round_tables enable row level security;

create policy "Verified owner reads own meetings"
  on public.round_tables for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner writes own meetings"
  on public.round_tables for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner updates own meetings"
  on public.round_tables for update to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner())
  with check (auth.uid() = owner_id and public.is_verified_owner());

-- ---------------------------------------------------------------------
-- 4. Append-only history. No update, no delete, for anyone but the
--    service role. Rows are evidence.
-- ---------------------------------------------------------------------

create table public.office_audit (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

grant select, insert on public.office_audit to authenticated;
grant all on public.office_audit to service_role;

alter table public.office_audit enable row level security;

create policy "Verified owner reads own history"
  on public.office_audit for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner appends own history"
  on public.office_audit for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());
-- No update or delete policy exists. History cannot be rewritten from the app.

create index office_audit_owner_at_idx on public.office_audit (owner_id, at desc);
