-- =====================================================================
-- CanX Office — durable AI request-rate and spending limits.
--
-- STATUS: NOT APPLIED. Reference SQL only.
--
-- The office refuses every paid AI call unless a reservation is granted
-- here first. If this schema is missing, the reservation fails and the
-- office denies. That is the intended behaviour, not a bug.
-- =====================================================================

create table public.ai_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  max_calls_per_minute integer not null default 6 check (max_calls_per_minute between 1 and 120),
  max_calls_per_day integer not null default 200 check (max_calls_per_day between 1 and 5000),
  max_cents_per_day integer not null default 500 check (max_cents_per_day between 0 and 100000),
  max_cents_per_month integer not null default 5000 check (max_cents_per_month between 0 and 1000000),
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
  estimated_cents integer not null default 0,
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

-- ---------------------------------------------------------------------
-- Reservation. Runs as definer so usage cannot be forged or skipped, but
-- it still refuses unless the CALLER is a verified owner with AAL2.
-- ---------------------------------------------------------------------

create or replace function public.reserve_ai_call(_estimated_cents integer)
returns table (allowed boolean, reason text, reservation_id uuid, remaining_today integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim public.ai_limits%rowtype;
  calls_minute integer;
  calls_day integer;
  cents_day integer;
  cents_month integer;
  new_id uuid;
begin
  if uid is null or not public.is_verified_owner() then
    return query select false, 'not_permitted'::text, null::uuid, 0;
    return;
  end if;

  select * into lim from public.ai_limits where owner_id = uid;
  if not found then
    -- No limits row means no agreed budget. Refuse.
    return query select false, 'unavailable'::text, null::uuid, 0;
    return;
  end if;

  select count(*) into calls_minute from public.ai_usage
    where owner_id = uid and at > now() - interval '1 minute';
  select count(*), coalesce(sum(estimated_cents), 0) into calls_day, cents_day
    from public.ai_usage where owner_id = uid and at > date_trunc('day', now());
  select coalesce(sum(estimated_cents), 0) into cents_month
    from public.ai_usage where owner_id = uid and at > date_trunc('month', now());

  if calls_minute >= lim.max_calls_per_minute then
    return query select false, 'rate_limit'::text, null::uuid, greatest(lim.max_calls_per_day - calls_day, 0);
    return;
  end if;

  if calls_day >= lim.max_calls_per_day
     or cents_day + coalesce(_estimated_cents, 0) > lim.max_cents_per_day
     or cents_month + coalesce(_estimated_cents, 0) > lim.max_cents_per_month then
    return query select false, 'budget_limit'::text, null::uuid, greatest(lim.max_calls_per_day - calls_day, 0);
    return;
  end if;

  insert into public.ai_usage (owner_id, estimated_cents)
  values (uid, greatest(coalesce(_estimated_cents, 0), 0))
  returning id into new_id;

  return query select true, 'ok'::text, new_id, greatest(lim.max_calls_per_day - calls_day - 1, 0);
end;
$$;

grant execute on function public.reserve_ai_call(integer) to authenticated;

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

grant execute on function public.settle_ai_call(uuid, text) to authenticated;
