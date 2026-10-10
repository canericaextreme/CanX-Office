-- Explicit delegated relay operations. Raw OAuth table policies remain intact.
-- Private helpers require the same live, unrevoked Office working grant.
create function canx_private.relay_save(_task_id uuid, _expected_at timestamptz, _patch jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); task public.manager_tasks%rowtype; saved public.manager_tasks%rowtype;
 old_evidence text; old_result text; added text; rid text; stamp timestamptz;
begin
 if not canx_private.mcp_work_active() then raise exception 'Office working grant required' using errcode='42501'; end if;
 if _task_id is null or _expected_at is null or jsonb_typeof(_patch) is distinct from 'object'
 or octet_length(_patch::text)>24000 or not (_patch ? 'evidence' and _patch ? 'updated_at')
 or exists(select 1 from jsonb_object_keys(_patch) k where k not in ('result','evidence','updated_at'))
 or jsonb_typeof(_patch->'evidence') is distinct from 'string'
 or jsonb_typeof(_patch->'updated_at') is distinct from 'string'
 or (_patch ? 'result' and jsonb_typeof(_patch->'result') is distinct from 'string')
 then raise exception 'Invalid relay patch'; end if;
 select * into task from public.manager_tasks where id=_task_id and owner_id=uid for update;
 if not found or task.updated_at<>_expected_at then return '[]'::jsonb; end if;
 if task.risk is distinct from 'green' or task.status in ('done','cancelled') then raise exception 'Open green task required'; end if;
 old_evidence:=coalesce(task.evidence,''); old_result:=coalesce(task.result,'');
 if length(_patch->>'evidence')>8000 or length(coalesce(_patch->>'result',old_result))>8000
 or left(_patch->>'evidence',length(old_evidence))<>old_evidence then raise exception 'Relay must preserve earlier evidence'; end if;
 stamp:=(_patch->>'updated_at')::timestamptz;
 if stamp<=task.updated_at or stamp>now()+interval '2 minutes' then raise exception 'Invalid relay timestamp'; end if;
 added:=substr(_patch->>'evidence',length(old_evidence)+1);
 if not (_patch ? 'result') then
  added:=trim(added,E'\n');
  if added !~ '^\[colleague-relay [0-9a-fA-F-]{36} claimed (claude|chatgpt) [^ ]+\]$' then raise exception 'Relay claim required'; end if;
  rid:=split_part(added,' ',2); perform rid::uuid;
  if position('[colleague-relay '||rid||' ' in old_evidence)>0 or position('[colleague-relay '||rid||' ' in old_result)>0 then return '[]'::jsonb; end if;
 else
  if left(_patch->>'result',length(old_result))<>old_result then raise exception 'Relay must preserve earlier replies'; end if;
  added:=trim(substr(_patch->>'result',length(old_result)+1),E'\n');
  if added !~ '^\[colleague-relay [0-9a-fA-F-]{36} reply (claude|chatgpt) [^ ]+\]' then raise exception 'Relay reply required'; end if;
  rid:=split_part(added,' ',2); perform rid::uuid;
  if position('[colleague-relay '||rid||' claimed ' in old_evidence)=0
  or position('[colleague-relay '||rid||' reply ' in old_result)>0
  or trim(substr(_patch->>'evidence',length(old_evidence)+1),E'\n') not like 'Relay receipt '||rid||': %'
  then raise exception 'Claim and receipt required'; end if;
 end if;
 update public.manager_tasks set evidence=_patch->>'evidence',result=coalesce(_patch->>'result',task.result),updated_at=stamp
 where id=_task_id and owner_id=uid returning * into saved;
 insert into public.office_audit(owner_id,action,entity,entity_id,detail)
 values(uid,'office_mcp.relay_save','manager_tasks',_task_id::text,jsonb_build_object('client_id',auth.jwt()->>'client_id','request_id',rid,'phase',case when _patch ? 'result' then 'reply' else 'claim' end));
 return jsonb_build_array(to_jsonb(saved));
end $$;
revoke all on function canx_private.relay_save(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function canx_private.relay_save(uuid,timestamptz,jsonb) to authenticated;
create function public.canx_mcp_relay_save(_task_id uuid,_expected_at timestamptz,_patch jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select canx_private.relay_save(_task_id,_expected_at,_patch) $$;
revoke all on function public.canx_mcp_relay_save(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.canx_mcp_relay_save(uuid,timestamptz,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION canx_private.relay_reserve(_estimated_cents integer)
 RETURNS TABLE(allowed boolean, reason text, reservation_id uuid, remaining_today integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not canx_private.mcp_work_active() then
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
$function$
;
revoke all on function canx_private.relay_reserve(integer) from public,anon,authenticated;
grant execute on function canx_private.relay_reserve(integer) to authenticated;
create function public.canx_mcp_relay_reserve(_estimated_cents integer) returns table(allowed boolean,reason text,reservation_id uuid,remaining_today integer) language sql security invoker set search_path='' as $$ select * from canx_private.relay_reserve(_estimated_cents) $$;
revoke all on function public.canx_mcp_relay_reserve(integer) from public,anon;
grant execute on function public.canx_mcp_relay_reserve(integer) to authenticated;

CREATE OR REPLACE FUNCTION canx_private.relay_settle(_reservation_id uuid, _outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not canx_private.mcp_work_active() then
    return;
  end if;
  update public.ai_usage
     set outcome = case when _outcome = 'ok' then 'ok' else 'failed' end,
         settled_at = now()
   where id = _reservation_id and owner_id = auth.uid() and outcome = 'reserved';
end;
$function$
;
revoke all on function canx_private.relay_settle(uuid,text) from public,anon,authenticated;
grant execute on function canx_private.relay_settle(uuid,text) to authenticated;
create function public.canx_mcp_relay_settle(_reservation_id uuid,_outcome text) returns void language sql security invoker set search_path='' as $$ select canx_private.relay_settle(_reservation_id,_outcome) $$;
revoke all on function public.canx_mcp_relay_settle(uuid,text) from public,anon;
grant execute on function public.canx_mcp_relay_settle(uuid,text) to authenticated;
