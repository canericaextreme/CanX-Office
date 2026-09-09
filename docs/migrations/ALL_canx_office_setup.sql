-- =====================================================================
-- CanX Office — COMPLETE reviewed setup script for the CanX-owned
-- Supabase project "Canx Office" (ref gmsjjiprtulxojhkmbqb,
-- organization canericaextreme, Canada Central).
--
-- Contents, in dependency order:
--   1. 0001_canx_office_core.sql   (roles, notes, meetings, audit)
--   2. 0002_ai_limits.sql          (AI rate + spend reservation)
--   3. 0003_finance_receipts.sql   (private finance receipts)
--
-- Reviewed corrections applied here:
--   * Explicit schema, table, SEQUENCE and FUNCTION grants, because this
--     project has automatic exposure of new tables switched OFF.
--   * No grant of any kind to anon. Nothing here is public.
--   * No owner bootstrap row: the owner role is granted only AFTER the
--     owner auth user exists, in a separate step.
--   * No example AI budget row: the C$500 monthly ceiling is a total
--     office running-cost ceiling, not an AI allocation.
--
-- Run this once, in the SQL editor of that project.
-- It creates new objects only. It does not delete or modify data.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Schema usage. Blanket default privileges are deliberately NOT granted.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- ---------------------------------------------------------------------
-- 1. Roles. Never stored on a profile row, never granted from the browser.
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
-- No insert/update/delete policy: roles change only with the service role.

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

create or replace function public.session_aal()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'aal', 'aal1')
$$;

create or replace function public.is_verified_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'owner') and public.session_aal() = 'aal2'
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.session_aal() from public;
revoke all on function public.is_verified_owner() from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
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
-- 4. Append-only history. Rows are evidence.
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
-- bigserial needs its sequence usable by the inserting role.
grant usage, select on sequence public.office_audit_id_seq to authenticated;
grant all on sequence public.office_audit_id_seq to service_role;

alter table public.office_audit enable row level security;

create policy "Verified owner reads own history"
  on public.office_audit for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner appends own history"
  on public.office_audit for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());
-- No update or delete policy exists. History cannot be rewritten.

create index office_audit_owner_at_idx on public.office_audit (owner_id, at desc);

-- ---------------------------------------------------------------------
-- 5. AI request-rate and spending limits.
--    No row is inserted here. With no limits row, every paid AI call is
--    refused. That is the intended default.
-- ---------------------------------------------------------------------
create table public.ai_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  max_calls_per_minute integer not null default 6 check (max_calls_per_minute between 1 and 120),
  max_calls_per_day integer not null default 200 check (max_calls_per_day between 1 and 5000),
  max_cents_per_day integer not null default 0 check (max_cents_per_day between 0 and 100000),
  max_cents_per_month integer not null default 0 check (max_cents_per_month between 0 and 1000000),
  updated_at timestamptz not null default now()
);

grant select on public.ai_limits to authenticated;
grant all on public.ai_limits to service_role;

alter table public.ai_limits enable row level security;

create policy "Verified owner reads own limits"
  on public.ai_limits for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());
-- Limits are changed only with the service role, deliberately.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  estimated_cents integer not null default 0
    check (estimated_cents >= 0 and estimated_cents <= 100000),
  outcome text not null default 'reserved' check (outcome in ('reserved', 'ok', 'failed')),
  at timestamptz not null default now(),
  settled_at timestamptz
);

grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

alter table public.ai_usage enable row level security;

create policy "Verified owner reads own usage"
  on public.ai_usage for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());
-- Inserts happen only through reserve_ai_call below.

create index ai_usage_owner_at_idx on public.ai_usage (owner_id, at desc);

-- Reservation. Signature unchanged.
--   * The owner's limits row is locked FOR UPDATE first, so two calls
--     arriving at once queue instead of both passing the same check.
--   * The estimate is validated before any arithmetic: null, zero,
--     negative and absurd values are refused outright.
--   * All counting and comparison is done in bigint, so a long history
--     cannot overflow an integer sum.
create or replace function public.reserve_ai_call(_estimated_cents integer)
returns table (allowed boolean, reason text, reservation_id uuid, remaining_today integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim public.ai_limits%rowtype;
  est bigint;
  calls_minute bigint;
  calls_day bigint;
  cents_day bigint;
  cents_month bigint;
  remaining bigint;
  new_id uuid;
begin
  if uid is null or not public.is_verified_owner() then
    return query select false, 'not_permitted'::text, null::uuid, 0;
    return;
  end if;

  -- Validate BEFORE any arithmetic. A negative estimate must never reach
  -- the budget comparison, and must never be clamped into an insert.
  if _estimated_cents is null then
    return query select false, 'invalid_estimate'::text, null::uuid, 0;
    return;
  end if;
  est := _estimated_cents::bigint;
  if est <= 0 or est > 100000 then
    return query select false, 'invalid_estimate'::text, null::uuid, 0;
    return;
  end if;

  -- Serialize every reservation for this owner. Concurrent calls block
  -- here until the one ahead of them has inserted its usage row.
  select * into lim from public.ai_limits where owner_id = uid for update;
  if not found then
    -- No limits row means no agreed budget. Refuse.
    return query select false, 'unavailable'::text, null::uuid, 0;
    return;
  end if;

  select count(*)::bigint into calls_minute from public.ai_usage
    where owner_id = uid and at > now() - interval '1 minute';
  select count(*)::bigint, coalesce(sum(estimated_cents::bigint), 0) into calls_day, cents_day
    from public.ai_usage where owner_id = uid and at > date_trunc('day', now());
  select coalesce(sum(estimated_cents::bigint), 0) into cents_month
    from public.ai_usage where owner_id = uid and at > date_trunc('month', now());

  remaining := greatest(lim.max_calls_per_day::bigint - calls_day, 0);

  if calls_minute >= lim.max_calls_per_minute::bigint then
    return query select false, 'rate_limit'::text, null::uuid, remaining::integer;
    return;
  end if;

  if calls_day >= lim.max_calls_per_day::bigint
     or cents_day + est > lim.max_cents_per_day::bigint
     or cents_month + est > lim.max_cents_per_month::bigint then
    return query select false, 'budget_limit'::text, null::uuid, remaining::integer;
    return;
  end if;

  insert into public.ai_usage (owner_id, estimated_cents)
  values (uid, est::integer)
  returning id into new_id;

  return query select true, 'ok'::text, new_id, greatest(remaining - 1, 0)::integer;
end;
$$;

create or replace function public.settle_ai_call(_reservation_id uuid, _outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_verified_owner() then
    return;
  end if;
  update public.ai_usage
     set outcome = case when _outcome = 'ok' then 'ok' else 'failed' end,
         settled_at = now()
   where id = _reservation_id and owner_id = auth.uid() and outcome = 'reserved';
end;
$$;

revoke all on function public.reserve_ai_call(integer) from public;
revoke all on function public.settle_ai_call(uuid, text) from public;
grant execute on function public.reserve_ai_call(integer) to authenticated;
grant execute on function public.settle_ai_call(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Private finance receipts. No financial data is seeded here.
-- ---------------------------------------------------------------------
create table public.finance_receipts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  doc jsonb not null default '{"schemaVersion":1,"kind":"canx-finance-receipts","receipts":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.finance_receipts to authenticated;
grant all on public.finance_receipts to service_role;

alter table public.finance_receipts enable row level security;

create policy "Owner reads own receipts"
  on public.finance_receipts for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Owner inserts own receipts"
  on public.finance_receipts for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Owner updates own receipts"
  on public.finance_receipts for update to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner())
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Owner deletes own receipts"
  on public.finance_receipts for delete to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

-- ---------------------------------------------------------------------
-- 7. Belt and braces: take away anything PUBLIC or anon may have picked
--    up from pre-existing default privileges, then re-state the minimum
--    the signed-in owner actually needs. Nothing here is public.
-- ---------------------------------------------------------------------
revoke all on public.user_roles, public.office_notes, public.round_tables,
              public.office_audit, public.ai_limits, public.ai_usage,
              public.finance_receipts
  from public;
revoke all on public.user_roles, public.office_notes, public.round_tables,
              public.office_audit, public.ai_limits, public.ai_usage,
              public.finance_receipts
  from anon;

revoke all on sequence public.office_audit_id_seq from public;
revoke all on sequence public.office_audit_id_seq from anon;

revoke all on function public.has_role(uuid, public.app_role) from anon;
revoke all on function public.session_aal() from anon;
revoke all on function public.is_verified_owner() from anon;
revoke all on function public.reserve_ai_call(integer) from anon;
revoke all on function public.settle_ai_call(uuid, text) from anon;

revoke usage on schema public from anon;

-- Minimum access for the signed-in owner. Every row is still decided by
-- the row-level policies above; these grants only make the tables visible
-- to the Data API at all.
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.office_notes to authenticated;
grant select, insert, update, delete on public.round_tables to authenticated;
grant select, insert on public.office_audit to authenticated;
grant usage, select on sequence public.office_audit_id_seq to authenticated;
grant select on public.ai_limits to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.finance_receipts to authenticated;

commit;


-- =====================================================================
-- NOT part of this script, on purpose:
--   * The owner role row. Grant it only after the owner auth user exists
--     and two-step verification is enrolled.
--   * Any AI budget row. Without one, paid AI stays refused.
-- =====================================================================
