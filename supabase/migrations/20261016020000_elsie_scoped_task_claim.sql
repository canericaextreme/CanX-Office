-- Prepared migration only. Apply after review; never broadens existing table policies.
-- Atomically claims one *existing* owner-scoped green CanX Office task.
-- Idempotence: a claimed task cannot be claimed again, even after timeout.
create or replace function canx_private.claim_elsie_task(_task_id uuid, _builder text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid;
  t public.manager_tasks%rowtype;
  marker text;
begin
  if not canx_private.mcp_work_active() then
    raise exception 'Office working grant required' using errcode='42501';
  end if;
  uid := canx_private.mcp_owner();
  if uid is null or _task_id is null or _builder not in ('claude','codex') then
    raise exception 'Invalid task claim';
  end if;
  -- Serialize all claims per owner and builder, not merely claims on the same task.\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text), pg_catalog.hashtext(_builder));\n  select * into t from public.manager_tasks where id=_task_id and owner_id=uid for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if t.status <> 'open' or t.risk <> 'green' or lower(coalesce(t.project,'')) <> 'canx office' then
    return jsonb_build_object('ok',false,'reason','not_eligible');
  end if;
  if lower(coalesce(t.worker,'')) <> _builder then
    return jsonb_build_object('ok',false,'reason','builder_mismatch');
  end if;
  if coalesce(t.evidence,'') ~* 'office-task-v2|codex-task-v1|(?:Claude|Codex) handoff|elsie-claim' then
    return jsonb_build_object('ok',false,'reason','already_attempted');
  end if;
  if exists(select 1 from public.manager_tasks other
    where other.owner_id=uid and lower(coalesce(other.worker,''))=_builder
      and other.status='in_progress' and other.id <> _task_id) then
    return jsonb_build_object('ok',false,'reason','builder_busy');
  end if;
  marker := '[elsie-claim ' || _builder || ' ' || _task_id::text || ']';
  update public.manager_tasks set status='in_progress',
    evidence=coalesce(t.evidence,'') || E'\n' || marker,
    updated_at=clock_timestamp()
  where id=_task_id and owner_id=uid;
  return jsonb_build_object('ok',true,'task_id',_task_id,'builder',_builder,'claim',marker);
end;
$$;
revoke all on function canx_private.claim_elsie_task(uuid,text) from public;
grant execute on function canx_private.claim_elsie_task(uuid,text) to authenticated;
create or replace function public.canx_mcp_claim_elsie_task(_task_id uuid, _builder text)
returns jsonb language sql security invoker set search_path = ''
as $$ select canx_private.claim_elsie_task(_task_id,_builder) $$;
revoke all on function public.canx_mcp_claim_elsie_task(uuid,text) from public;
grant execute on function public.canx_mcp_claim_elsie_task(uuid,text) to authenticated;
