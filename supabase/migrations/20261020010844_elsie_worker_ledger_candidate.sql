-- canx:hold — candidate only; separate owner security review and activation required.
-- No worker credential is created here. The worker role can call only scoped RPCs.
create role elsie_worker nologin;
grant elsie_worker to authenticator;
grant usage on schema public, canx_private to elsie_worker;

create table canx_private.elsie_work_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 stopped_at timestamptz, max_cents integer not null check(max_cents between 0 and 10000),
 check(expires_at > created_at and expires_at <= created_at + interval '10 hours')
);
create table canx_private.elsie_work_jobs (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references canx_private.elsie_work_sessions(id),
 task_id uuid not null references public.manager_tasks(id), builder text not null check(builder in ('codex','claude')),
 task_version timestamptz not null, state text not null default 'queued'
 check(state in ('queued','leased','attempted','submitted','uncertain','awaiting_review','blocked','cancelled')),
 lease_id uuid, lease_until timestamptz, reservation_id uuid references public.ai_usage(id),
 run_id bigint check(run_id > 0), request text not null, reason text not null default '',
 created_at timestamptz not null default now(), unique(task_id)
);
-- Expiring a lease never erases an attempted external side effect.
create unique index elsie_one_active_builder on canx_private.elsie_work_jobs(builder)
 where state in ('leased','attempted','submitted','uncertain');
create index elsie_session_jobs on canx_private.elsie_work_jobs(session_id,created_at);
create table canx_private.elsie_work_events (
 id bigint generated always as identity primary key, session_id uuid not null references canx_private.elsie_work_sessions(id),
 job_id uuid references canx_private.elsie_work_jobs(id), event text not null,
 at timestamptz not null default clock_timestamp(), detail jsonb not null default '{}'
);
-- Written ONLY by a separately reviewed authoritative accounting adapter.
-- No owner/browser/worker write grant. Missing/stale evidence means no paid call.
create table canx_private.elsie_provider_evidence (
 builder text primary key check(builder in ('codex','claude')), checked_at timestamptz not null,
 currency text not null check(currency='USD'),
 remaining_cents integer not null check(remaining_cents >= 0), upper_bound_cents integer not null check(upper_bound_cents > 0),
 hard_limit_enforced boolean not null default false
);
alter table canx_private.elsie_work_sessions enable row level security;
alter table canx_private.elsie_work_jobs enable row level security;
alter table canx_private.elsie_work_events enable row level security;
alter table canx_private.elsie_provider_evidence enable row level security;
revoke all on canx_private.elsie_work_sessions,canx_private.elsie_work_jobs,canx_private.elsie_work_events,canx_private.elsie_provider_evidence from public,anon,authenticated,elsie_worker;

create function canx_private.elsie_enroll(_expires timestamptz,_max_cents integer,_tasks uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; tid uuid; t public.manager_tasks%rowtype; b text;
begin
 if uid is null or auth.jwt()->>'aal' is distinct from 'aal2' or auth.jwt() ? 'client_id'
 or not public.has_role(uid,'owner') then raise exception 'Direct owner MFA required' using errcode='42501'; end if;
 if _expires is null or _expires<=now() or _expires>now()+interval '10 hours'
 or _max_cents is null or _max_cents<0 or _max_cents>10000
 or coalesce(cardinality(_tasks),0) not between 1 and 6 then raise exception 'Invalid bounded grant'; end if;
 insert into canx_private.elsie_work_sessions(owner_id,expires_at,max_cents) values(uid,_expires,_max_cents) returning id into sid;
 foreach tid in array _tasks loop
  select * into t from public.manager_tasks where id=tid and owner_id=uid for update;
  if not found then raise exception 'Task unavailable'; end if;
  b:=lower(t.worker);
  if t.status<>'open' or t.risk<>'green' or lower(t.project)<>'canx office' or b not in ('codex','claude')
   or coalesce(t.evidence,'') not like '%[elsie-queue '||b||' %'
   or char_length(coalesce(t.evidence,''))>1400
   or coalesce(t.evidence,'') ~* 'office-task-v2|codex-task-v1|elsie-claim' then raise exception 'Task not eligible'; end if;
  if (select count(*) from canx_private.elsie_work_jobs where session_id=sid and builder=b)>=3 then raise exception 'Builder queue full'; end if;
  insert into canx_private.elsie_work_jobs(session_id,task_id,builder,task_version,request)
  values(sid,tid,b,t.updated_at,t.title||E'\n'||t.detail);
 end loop;
 insert into canx_private.elsie_work_events(session_id,event) values(sid,'owner_enrolled');
 return sid;
end $$;

create function canx_private.elsie_owner_stop(_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'owner') or auth.jwt()->>'aal' is distinct from 'aal2'
 or auth.jwt() ? 'client_id' then raise exception 'Direct owner MFA required' using errcode='42501'; end if;
 update canx_private.elsie_work_sessions set stopped_at=clock_timestamp() where id=_session and owner_id=auth.uid();
 if not found then raise exception 'Session unavailable'; end if;
 update canx_private.elsie_work_jobs set state='cancelled',reason='Owner stopped before dispatch'
 where session_id=_session and state in ('queued','leased');
 insert into canx_private.elsie_work_events(session_id,event) values(_session,'owner_stopped');
end $$;

create function canx_private.elsie_worker_session() returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'elsie_worker' then raise exception 'Scoped worker identity required' using errcode='42501'; end if;
 return (auth.jwt()->>'elsie_session')::uuid;
end $$;

create function canx_private.elsie_claim(_builder text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid:=canx_private.elsie_worker_session(); s canx_private.elsie_work_sessions%rowtype;
 j canx_private.elsie_work_jobs%rowtype; lim public.ai_limits%rowtype; p canx_private.elsie_provider_evidence%rowtype;
 t public.manager_tasks%rowtype; daily bigint; monthly bigint; session_spend bigint; rid uuid; lid uuid;
begin
 if sid is null or _builder not in ('codex','claude') then return jsonb_build_object('state','blocked','reason','invalid_scope'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('elsie-worker'),pg_catalog.hashtext(_builder));
 select * into s from canx_private.elsie_work_sessions where id=sid for update;
 if not found or s.stopped_at is not null or s.expires_at<=clock_timestamp() then return jsonb_build_object('state','blocked','reason','grant_inactive'); end if;
 -- Resume only a pre-dispatch lease. Attempted/uncertain/submitted jobs retain the builder slot.
 update canx_private.elsie_work_jobs set state='blocked',reason='Lease expired before dispatch; reservation retained'
 where session_id=sid and builder=_builder and state='leased' and lease_until<=clock_timestamp();
 if exists(select 1 from canx_private.elsie_work_jobs where builder=_builder and state in ('leased','attempted','submitted','uncertain'))
 then return jsonb_build_object('state','waiting','reason','builder_busy_or_uncertain'); end if;
 select * into j from canx_private.elsie_work_jobs where session_id=sid and builder=_builder and state='queued' order by created_at,id limit 1 for update;
 if not found then return jsonb_build_object('state','waiting','reason','queue_empty'); end if;
 select * into t from public.manager_tasks where id=j.task_id and owner_id=s.owner_id for update;
 if not found or t.updated_at is distinct from j.task_version or t.risk<>'green' or t.status<>'open' or lower(t.worker)<>_builder then
  update canx_private.elsie_work_jobs set state='blocked',reason='Task changed since owner enrollment' where id=j.id;
  insert into canx_private.elsie_work_events(session_id,job_id,event) values(sid,j.id,'task_changed');
  return jsonb_build_object('state','blocked','reason','task_changed');
 end if;
 select * into p from canx_private.elsie_provider_evidence where builder=_builder for update;
 if not found or p.checked_at>clock_timestamp() or p.checked_at<clock_timestamp()-interval '5 minutes' or not p.hard_limit_enforced then
  update canx_private.elsie_work_jobs set state='blocked',reason='Authoritative spending evidence unavailable' where id=j.id;
  update public.manager_tasks set status='waiting',waiting_reason='Worker blocked: authoritative spending evidence unavailable',updated_at=clock_timestamp() where id=j.task_id and owner_id=s.owner_id;
  insert into public.office_notes(id,owner_id,kind,title,detail,owner_name,provenance,source)
  values('elsie-worker-'||j.id::text,s.owner_id,'task','Elsie worker blocked','Authoritative provider balance or enforced per-run ceiling unavailable. No dispatch or reservation.','Elsie','ai-proposal','Elsie worker');
  insert into canx_private.elsie_work_events(session_id,job_id,event) values(sid,j.id,'authoritative_spending_unavailable');
  return jsonb_build_object('state','blocked','reason','authoritative_spending_unavailable');
 end if;
 select * into lim from public.ai_limits where owner_id=s.owner_id for update;
 if not found then return jsonb_build_object('state','blocked','reason','budget_unavailable'); end if;
 select coalesce(sum(estimated_cents),0) into daily from public.ai_usage where owner_id=s.owner_id and at>=date_trunc('day',now());
 select coalesce(sum(estimated_cents),0) into monthly from public.ai_usage where owner_id=s.owner_id and at>=date_trunc('month',now());
 select coalesce(sum(u.estimated_cents),0) into session_spend from canx_private.elsie_work_jobs x join public.ai_usage u on u.id=x.reservation_id where x.session_id=sid;
 if daily+p.upper_bound_cents>lim.max_cents_per_day or monthly+p.upper_bound_cents>lim.max_cents_per_month
 or session_spend+p.upper_bound_cents>s.max_cents or p.remaining_cents<p.upper_bound_cents
 or (select count(*) from public.ai_usage where owner_id=s.owner_id and at>=now()-interval '1 minute')>=lim.max_calls_per_minute
 or (select count(*) from public.ai_usage where owner_id=s.owner_id and at>=date_trunc('day',now()))>=lim.max_calls_per_day
 then return jsonb_build_object('state','blocked','reason','budget_limit'); end if;
 insert into public.ai_usage(owner_id,estimated_cents) values(s.owner_id,p.upper_bound_cents) returning id into rid;
 update canx_private.elsie_provider_evidence set remaining_cents=remaining_cents-p.upper_bound_cents where builder=_builder;
 lid:=gen_random_uuid();
 update canx_private.elsie_work_jobs set state='leased',lease_id=lid,lease_until=clock_timestamp()+interval '60 seconds',reservation_id=rid where id=j.id;
 insert into canx_private.elsie_work_events(session_id,job_id,event,detail) values(sid,j.id,'reserved_and_leased',jsonb_build_object('reservation_id',rid));
 return jsonb_build_object('state','leased','jobId',j.id,'taskId',j.task_id,'leaseId',lid,'builder',j.builder,'request',j.request,'upperBoundCents',p.upper_bound_cents);
end $$;

create function canx_private.elsie_begin(_job uuid,_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare sid uuid:=canx_private.elsie_worker_session(); s canx_private.elsie_work_sessions%rowtype; j canx_private.elsie_work_jobs%rowtype;
begin
 select * into s from canx_private.elsie_work_sessions where id=sid for update;
 if not found or s.stopped_at is not null or s.expires_at<=clock_timestamp() then return false; end if;
 update canx_private.elsie_work_jobs set state='attempted' where id=_job and session_id=sid and state='leased' and lease_id=_lease and lease_until>clock_timestamp()
 and exists(select 1 from public.manager_tasks t where t.id=task_id and t.owner_id=s.owner_id and t.updated_at=task_version and t.status='open' and t.risk='green' and lower(t.worker)=builder);
 if not found then return false; end if;
 select * into j from canx_private.elsie_work_jobs where id=_job;
 update public.manager_tasks set status='in_progress',evidence=jsonb_build_object('kind','office-task-v2','builder',j.builder,'attempt',j.id,'state','submission_unconfirmed')::text||E'\n'||coalesce(evidence,''),updated_at=clock_timestamp() where id=j.task_id and owner_id=s.owner_id;
 insert into canx_private.elsie_work_events(session_id,job_id,event) values(sid,_job,'dispatch_committed');
 return true;
end $$;

create function canx_private.elsie_receipt(_job uuid,_run bigint) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid:=canx_private.elsie_worker_session(); j canx_private.elsie_work_jobs%rowtype; uid uuid;
begin
 select * into j from canx_private.elsie_work_jobs where id=_job and session_id=sid and state='attempted' for update;
 if not found then raise exception 'Committed attempt unavailable'; end if;
 update canx_private.elsie_work_jobs set state=case when _run>0 then 'submitted' else 'uncertain' end,run_id=case when _run>0 then _run end where id=_job;
 select owner_id into uid from canx_private.elsie_work_sessions where id=sid;
 update public.manager_tasks set status='in_progress',evidence=jsonb_build_object('kind','office-task-v2','builder',j.builder,'attempt',j.id,'state',case when _run>0 then 'queued' else 'submission_unconfirmed' end,'runId',_run)::text||substring(evidence from position(E'\n' in evidence)),updated_at=clock_timestamp()
 where id=j.task_id and owner_id=uid;
 insert into public.office_notes(id,owner_id,kind,title,detail,owner_name,provenance,source)
 values('elsie-worker-'||_job::text,uid,'task','Elsie worker dispatch receipt',case when _run>0 then 'Build submitted; run '||_run::text||'. Not completed or published.' else 'Dispatch uncertain. No retry permitted.' end,'Elsie','ai-proposal','Elsie worker');
 insert into canx_private.elsie_work_events(session_id,job_id,event,detail) values(sid,_job,'dispatch_receipt',jsonb_build_object('run_id',_run));
end $$;

revoke all on function canx_private.elsie_enroll(timestamptz,integer,uuid[]),canx_private.elsie_owner_stop(uuid),canx_private.elsie_worker_session(),canx_private.elsie_claim(text),canx_private.elsie_begin(uuid,uuid),canx_private.elsie_receipt(uuid,bigint) from public,anon,authenticated,elsie_worker;
grant execute on function canx_private.elsie_enroll(timestamptz,integer,uuid[]),canx_private.elsie_owner_stop(uuid) to authenticated;
grant execute on function canx_private.elsie_worker_session(),canx_private.elsie_claim(text),canx_private.elsie_begin(uuid,uuid),canx_private.elsie_receipt(uuid,bigint) to elsie_worker;
-- Public wrappers preserve the narrow caller role; no table permissions are granted.
create function public.elsie_worker_claim(_builder text) returns jsonb language sql security invoker set search_path='' as $$ select canx_private.elsie_claim(_builder) $$;
create function public.elsie_worker_begin(_job uuid,_lease uuid) returns boolean language sql security invoker set search_path='' as $$ select canx_private.elsie_begin(_job,_lease) $$;
create function public.elsie_worker_receipt(_job uuid,_run bigint) returns void language sql security invoker set search_path='' as $$ select canx_private.elsie_receipt(_job,_run) $$;
revoke all on function public.elsie_worker_claim(text),public.elsie_worker_begin(uuid,uuid),public.elsie_worker_receipt(uuid,bigint) from public,anon,authenticated;
grant execute on function public.elsie_worker_claim(text),public.elsie_worker_begin(uuid,uuid),public.elsie_worker_receipt(uuid,bigint) to elsie_worker;

create function canx_private.elsie_reconcile(_job uuid,_run bigint,_outcome text) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid:=canx_private.elsie_worker_session(); j canx_private.elsie_work_jobs%rowtype; uid uuid;
begin
 if _outcome not in ('success','failure','cancelled','timed_out','action_required','startup_failure','stale','skipped') then raise exception 'Nonterminal outcome'; end if;
 select * into j from canx_private.elsie_work_jobs where id=_job and session_id=sid and run_id=_run and state='submitted' for update;
 if not found then raise exception 'Linked submitted run unavailable'; end if;
 select owner_id into uid from canx_private.elsie_work_sessions where id=sid;
 update canx_private.elsie_work_jobs set state=case when _outcome='success' then 'awaiting_review' else 'blocked' end,reason='Build outcome: '||_outcome||'; no automatic retry' where id=_job;
 -- Retain the upper-bound reservation in spend totals even after failure.
 update public.ai_usage set outcome=case when _outcome='success' then 'ok' else 'failed' end,settled_at=clock_timestamp() where id=j.reservation_id and owner_id=uid;
 update public.manager_tasks set status='waiting',waiting_reason=case when _outcome='success' then 'Independent review and guarded release required' else 'Worker build '||_outcome||'; inspect before any new attempt' end,updated_at=clock_timestamp() where id=j.task_id and owner_id=uid;
 update public.office_notes set detail=detail||E'\nBuild outcome: '||_outcome||'. Not a live-release receipt.',updated_at=clock_timestamp() where id='elsie-worker-'||_job::text and owner_id=uid;
 insert into canx_private.elsie_work_events(session_id,job_id,event,detail) values(sid,_job,'run_reconciled',jsonb_build_object('run_id',_run,'outcome',_outcome));
end $$;
create function canx_private.elsie_pending() returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('jobId',id,'builder',builder,'runId',run_id,'state',state)),'[]'::jsonb)
 from canx_private.elsie_work_jobs where session_id=canx_private.elsie_worker_session() and state in ('attempted','submitted','uncertain')
$$;
create function public.elsie_worker_reconcile(_job uuid,_run bigint,_outcome text) returns void language sql security invoker set search_path='' as $$ select canx_private.elsie_reconcile(_job,_run,_outcome) $$;
create function public.elsie_worker_pending() returns jsonb language sql security invoker set search_path='' as $$ select canx_private.elsie_pending() $$;
revoke all on function canx_private.elsie_reconcile(uuid,bigint,text),canx_private.elsie_pending(),public.elsie_worker_reconcile(uuid,bigint,text),public.elsie_worker_pending() from public,anon,authenticated;
grant execute on function canx_private.elsie_reconcile(uuid,bigint,text),canx_private.elsie_pending(),public.elsie_worker_reconcile(uuid,bigint,text),public.elsie_worker_pending() to elsie_worker;
create function public.elsie_worker_enroll(_expires timestamptz,_max_cents integer,_tasks uuid[]) returns uuid language sql security invoker set search_path='' as $$ select canx_private.elsie_enroll(_expires,_max_cents,_tasks) $$;
create function public.elsie_worker_stop(_session uuid) returns void language sql security invoker set search_path='' as $$ select canx_private.elsie_owner_stop(_session) $$;
revoke all on function public.elsie_worker_enroll(timestamptz,integer,uuid[]),public.elsie_worker_stop(uuid) from public,anon;
grant execute on function public.elsie_worker_enroll(timestamptz,integer,uuid[]),public.elsie_worker_stop(uuid) to authenticated;

create function canx_private.elsie_owner_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or auth.jwt()->>'aal' is distinct from 'aal2' or auth.jwt() ? 'client_id' or not public.has_role(uid,'owner') then raise exception 'Direct owner MFA required' using errcode='42501'; end if;
 return jsonb_build_object('sessions',coalesce((select jsonb_agg(x) from (select id,expires_at,stopped_at,max_cents from canx_private.elsie_work_sessions where owner_id=uid order by created_at desc limit 20)x),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(x) from (select t.id,t.title,t.worker from public.manager_tasks t where t.owner_id=uid and t.status='open' and t.risk='green' and lower(t.project)='canx office' and lower(t.worker) in ('claude','codex') and coalesce(t.evidence,'') like '%[elsie-queue '||lower(t.worker)||' %' and not exists(select 1 from canx_private.elsie_work_jobs j where j.task_id=t.id) order by t.created_at limit 100)x),'[]'::jsonb));
end $$;
create function public.elsie_worker_status() returns jsonb language sql security invoker set search_path='' as $$ select canx_private.elsie_owner_status() $$;
revoke all on function canx_private.elsie_owner_status(),public.elsie_worker_status() from public,anon,elsie_worker;
grant execute on function canx_private.elsie_owner_status(),public.elsie_worker_status() to authenticated;
