-- =====================================================================
-- CanX Office — Manager workbench: master task list, approvals, change log.
--
-- STATUS: NOT APPLIED. Apply only to the existing CanX-owned external database.
-- This migration is additive; no existing table is altered destructively.
--
-- Depends on: 0001_canx_office_core.sql, 0002_ai_limits.sql, 0003_finance_receipts.sql.
-- Apply order: 0001, 0002, 0003, 0004, then this file.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Master task list. One row per task, owner-scoped, with status and
--    the Manager's own risk label.
-- ---------------------------------------------------------------------

create table public.manager_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  detail text not null default '' check (char_length(detail) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  risk text not null default 'green' check (risk in ('green', 'yellow', 'red')),
  worker text not null default '' check (char_length(worker) <= 160),
  result text not null default '' check (char_length(result) <= 2000),
  evidence text not null default '' check (char_length(evidence) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.manager_tasks to authenticated;
grant all on public.manager_tasks to service_role;

alter table public.manager_tasks enable row level security;

create policy "Verified owner reads own tasks"
  on public.manager_tasks for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner writes own tasks"
  on public.manager_tasks for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner updates own tasks"
  on public.manager_tasks for update to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner())
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner deletes own tasks"
  on public.manager_tasks for delete to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

-- ---------------------------------------------------------------------
-- 2. Assignments. One row each time the Manager assigns a task to a
--    worker, so the history of who did what is preserved.
-- ---------------------------------------------------------------------

create table public.manager_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.manager_tasks(id) on delete cascade,
  worker text not null check (char_length(worker) between 1 and 160),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  result text not null default '' check (char_length(result) <= 2000),
  evidence text not null default '' check (char_length(evidence) <= 2000)
);

grant select, insert, update on public.manager_assignments to authenticated;
grant all on public.manager_assignments to service_role;

alter table public.manager_assignments enable row level security;

create policy "Verified owner reads own assignments"
  on public.manager_assignments for select to authenticated
  using (exists (
    select 1 from public.manager_tasks t
    where t.id = manager_assignments.task_id
      and t.owner_id = auth.uid()
      and public.is_verified_owner()
  ));

create policy "Verified owner writes own assignments"
  on public.manager_assignments for insert to authenticated
  with check (exists (
    select 1 from public.manager_tasks t
    where t.id = manager_assignments.task_id
      and t.owner_id = auth.uid()
      and public.is_verified_owner()
  ));

create policy "Verified owner updates own assignments"
  on public.manager_assignments for update to authenticated
  using (exists (
    select 1 from public.manager_tasks t
    where t.id = manager_assignments.task_id
      and t.owner_id = auth.uid()
      and public.is_verified_owner()
  ))
  with check (exists (
    select 1 from public.manager_tasks t
    where t.id = manager_assignments.task_id
      and t.owner_id = auth.uid()
      and public.is_verified_owner()
  ));

-- ---------------------------------------------------------------------
-- 3. Approval box. Yellow-light actions wait here. Only the owner can
--    approve or decline, and the decision is logged.
-- ---------------------------------------------------------------------

create table public.manager_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.manager_tasks(id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  detail text not null default '' check (char_length(detail) <= 2000),
  cost_cents integer check (cost_cents is null or cost_cents between 0 and 100000),
  risk text not null default 'yellow' check (risk in ('green', 'yellow', 'red')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

grant select, insert, update on public.manager_approvals to authenticated;
grant all on public.manager_approvals to service_role;

alter table public.manager_approvals enable row level security;

create policy "Verified owner reads own approvals"
  on public.manager_approvals for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner writes own approvals"
  on public.manager_approvals for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner updates own approvals"
  on public.manager_approvals for update to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner())
  with check (auth.uid() = owner_id and public.is_verified_owner());

-- ---------------------------------------------------------------------
-- 4. Change log. Append-only. Every Manager-made change is recorded with
--    before/after snapshots so rollback points can be named and applied.
-- ---------------------------------------------------------------------

create table public.manager_changes (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

grant select, insert on public.manager_changes to authenticated;
-- INSERT uses nextval for the bigserial id; table INSERT alone is insufficient.
grant usage on sequence public.manager_changes_id_seq to authenticated;
grant all on public.manager_changes to service_role;

alter table public.manager_changes enable row level security;

create policy "Verified owner reads own change log"
  on public.manager_changes for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create policy "Verified owner appends own change log"
  on public.manager_changes for insert to authenticated
  with check (auth.uid() = owner_id and public.is_verified_owner());
-- No update or delete policy. The change log cannot be rewritten.

create index manager_changes_owner_at_idx on public.manager_changes (owner_id, at desc);

-- ---------------------------------------------------------------------
-- 5. Budget enforcement helper. Ensures the owner's ai_limits row exists
--    with the Manager's C$100/month ceiling. Only a verified owner can
--    create their own row; the service role can also manage it.
-- ---------------------------------------------------------------------

create or replace function public.ensure_manager_ai_budget(_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from _owner_id or not public.is_verified_owner() then
    raise exception 'forbidden';
  end if;
  insert into public.ai_limits (owner_id, max_calls_per_minute, max_calls_per_day, max_cents_per_day, max_cents_per_month)
  values (_owner_id, 6, 200, 500, 10000)
  on conflict (owner_id) do update set
    max_cents_per_month = 10000,
    updated_at = now()
  where public.ai_limits.owner_id = _owner_id;
end;
$$;

grant execute on function public.ensure_manager_ai_budget(uuid) to authenticated;
grant execute on function public.ensure_manager_ai_budget(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Budget status helper. Returns used cents this month and the warning
--    state for the Manager's C$100 ceiling.
-- ---------------------------------------------------------------------

create or replace function public.manager_budget_status(_owner_id uuid)
returns table (
  used_cents bigint,
  ceiling_cents integer,
  warn_cents integer,
  paused boolean,
  warning boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(u.estimated_cents::bigint), 0) as used_cents,
    10000 as ceiling_cents,
    7500 as warn_cents,
    (coalesce(sum(u.estimated_cents::bigint), 0) >= 10000) as paused,
    (coalesce(sum(u.estimated_cents::bigint), 0) >= 7500) as warning
  from public.ai_usage u
  where u.owner_id = _owner_id
    and u.at > date_trunc('month', now());
$$;

grant execute on function public.manager_budget_status(uuid) to authenticated;
grant execute on function public.manager_budget_status(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7. Helper to append a change record from the Manager.
-- ---------------------------------------------------------------------

create or replace function public.log_manager_change(
  _owner_id uuid,
  _action text,
  _entity text,
  _entity_id text,
  _before jsonb,
  _after jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from _owner_id or not public.is_verified_owner() then
    raise exception 'forbidden';
  end if;
  insert into public.manager_changes (owner_id, action, entity, entity_id, before, after)
  values (_owner_id, _action, _entity, _entity_id, _before, _after);
end;
$$;

grant execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.log_manager_change(uuid, text, text, text, jsonb, jsonb) to service_role;
