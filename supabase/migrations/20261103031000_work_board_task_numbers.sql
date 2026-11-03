-- 3 Nov 2026, John: Work Board date-based task numbers (task c736bb61), approved in thread
-- "Get stuck Work Board tasks moving". See docs/work-board-task-numbers.md.
-- Additive only: a nullable task_number column, a private per-day counter, and triggers.
-- Existing tasks keep no number (nothing is renumbered). Every creation path gets a number because
-- it happens in the database at insert time. The counter row is locked by the upsert, so two tasks
-- created at the same moment can never get the same N. Numbers never change after creation.
-- Day = John's local calendar day (America/Whitehorse, same as his routines).
alter table public.manager_tasks add column if not exists task_number text;
create unique index if not exists manager_tasks_owner_task_number_key
  on public.manager_tasks (owner_id, task_number) where task_number is not null;

create table if not exists canx_private.manager_task_day_counters (
  owner_id uuid not null,
  day date not null,
  last_n integer not null,
  primary key (owner_id, day)
);
revoke all on canx_private.manager_task_day_counters from public, anon, authenticated;

create or replace function canx_private.manager_task_number_assign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d date; n integer;
begin
  d := (coalesce(new.created_at, now()) at time zone 'America/Whitehorse')::date;
  insert into canx_private.manager_task_day_counters as c (owner_id, day, last_n)
    values (new.owner_id, d, 1)
    on conflict (owner_id, day) do update set last_n = c.last_n + 1
    returning last_n into n;
  new.task_number := 'WB-' || to_char(d, 'MM-DD-YYYY') || '-' || n;
  return new;
end $$;

create or replace function canx_private.manager_task_number_keep() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.task_number := old.task_number;
  return new;
end $$;

revoke all on function canx_private.manager_task_number_assign() from public, anon, authenticated;
revoke all on function canx_private.manager_task_number_keep() from public, anon, authenticated;

drop trigger if exists manager_tasks_number_assign on public.manager_tasks;
create trigger manager_tasks_number_assign before insert on public.manager_tasks
  for each row execute function canx_private.manager_task_number_assign();
drop trigger if exists manager_tasks_number_keep on public.manager_tasks;
create trigger manager_tasks_number_keep before update of task_number on public.manager_tasks
  for each row execute function canx_private.manager_task_number_keep();
