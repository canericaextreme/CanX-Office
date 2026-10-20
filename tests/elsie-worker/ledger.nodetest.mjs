// Run with CANX_PGLITE_MODULE pointing to the installed PGlite module.
// Uses a disposable, local PostgreSQL instance; never connects to Supabase.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.CANX_PGLITE_MODULE ?? '@electric-sql/pglite');
const owner='00000000-0000-4000-8000-000000000001';
const task='00000000-0000-4000-8000-000000000002';
const task2='00000000-0000-4000-8000-000000000003';
async function fixture(dataDir){
 const db=new PGlite(dataDir);
 await db.exec(`create role anon;create role authenticated;create role authenticator;create schema auth;create schema canx_private;
 create function auth.uid() returns uuid language sql as $$ select ((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'sub')::uuid $$;
 create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create table auth.users(id uuid primary key);
 create function public.has_role(uuid,text) returns boolean language sql as $$ select $1='${owner}'::uuid and $2='owner' $$;
 create table public.manager_tasks(id uuid primary key,owner_id uuid,title text,detail text,status text,risk text,project text,worker text,evidence text default '' check(length(evidence)<=2000),waiting_reason text default '',created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.ai_limits(owner_id uuid primary key,max_calls_per_minute int,max_calls_per_day int,max_cents_per_day int,max_cents_per_month int);
 create table public.ai_usage(id uuid primary key default gen_random_uuid(),owner_id uuid,estimated_cents int,outcome text default 'reserved',at timestamptz default now(),settled_at timestamptz);
 create table public.office_notes(id text primary key,owner_id uuid,kind text check(kind in ('task','decision')),title text,detail text check(length(detail)<=2000),owner_name text,provenance text check(provenance in ('john','ai-proposal','sample')),source text,updated_at timestamptz default now());
 insert into auth.users values('${owner}');
 insert into public.ai_limits values('${owner}',10,100,500,1000);
 insert into public.manager_tasks(id,owner_id,title,detail,status,risk,project,worker,evidence) values
 ('${task}','${owner}','Fix the Office button','Make the button readable','open','green','CanX Office','claude','[elsie-queue claude 2026-10-20T00:00:00.000Z]'),
 ('${task2}','${owner}','Fix the Office label','Make the label readable','open','green','CanX Office','claude','[elsie-queue claude 2026-10-20T00:00:00.000Z]');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020010844_elsie_worker_ledger_candidate.sql','utf8'));
 async function identity(claims){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);}
 async function enroll(){await identity({sub:owner,aal:'aal2',role:'authenticated'});return (await db.query("select public.elsie_worker_enroll(now()+interval '1 hour',500,$1::uuid[]) as id",[[task,task2]])).rows[0].id;}
 async function worker(sid){await identity({role:'elsie_worker',elsie_session:sid});}
 async function budget(){await db.exec("insert into canx_private.elsie_provider_evidence values('claude',now(),'USD',1000,100,true)");}
 async function claim(){return (await db.query("select public.elsie_worker_claim('claude') as result")).rows[0].result;}
 return {db,identity,enroll,worker,budget,claim};
}
test('migration parses; grant requires direct owner MFA; narrow role has no table access',async()=>{
 const f=await fixture();try{
 await f.identity({sub:owner,aal:'aal1'});
 await assert.rejects(f.db.query("select public.elsie_worker_enroll(now()+interval '1 hour',100,$1::uuid[])",[[task]]),/MFA/);
 assert.equal((await f.db.query("select has_table_privilege('elsie_worker','canx_private.elsie_work_jobs','select') as allowed")).rows[0].allowed,false);
 await f.identity({role:'authenticated',elsie_session:owner});await assert.rejects(f.claim(),/Scoped worker/);
 }finally{await f.db.close();}
});
test('missing authoritative credit blocks with a durable event and no reservation',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.worker(sid);
 assert.equal((await f.claim()).reason,'authoritative_spending_unavailable');
 assert.equal((await f.db.query('select count(*)::int as n from public.ai_usage')).rows[0].n,0);
 assert.match((await f.db.query('select detail from public.office_notes')).rows[0].detail,/No dispatch/);
 assert.equal((await f.db.query("select count(*)::int as n from public.manager_tasks where status='waiting'")).rows[0].n,1);
 assert.equal((await f.db.query("select count(*)::int as n from canx_private.elsie_work_events where event='authoritative_spending_unavailable'")).rows[0].n,1);
 }finally{await f.db.close();}
});
test('one builder slot, one committed attempt, uncertain outcome cannot be redispatched',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);
 const j=await f.claim();assert.equal(j.state,'leased');assert.equal((await f.claim()).reason,'builder_busy_or_uncertain');
 assert.equal((await f.db.query('select public.elsie_worker_begin($1,$2) as ok',[j.jobId,j.leaseId])).rows[0].ok,true);
 assert.equal((await f.db.query('select public.elsie_worker_begin($1,$2) as ok',[j.jobId,j.leaseId])).rows[0].ok,false);
 await f.db.query('select public.elsie_worker_receipt($1,null)',[j.jobId]);
 assert.equal((await f.claim()).reason,'builder_busy_or_uncertain');
 assert.equal((await f.db.query('select count(*)::int as n from public.ai_usage')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('owner stop immediately denies begin, while a recorded run can still reconcile',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);const j=await f.claim();
 await f.identity({sub:owner,aal:'aal2'});await f.db.query('select public.elsie_worker_stop($1)',[sid]);await f.worker(sid);
 assert.equal((await f.db.query('select public.elsie_worker_begin($1,$2) as ok',[j.jobId,j.leaseId])).rows[0].ok,false);
 assert.equal((await f.claim()).reason,'grant_inactive');
 }finally{await f.db.close();}
});
test('a terminal build records Work Board and Brain evidence, then advances without repeating the first task',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);const j=await f.claim();
 await f.db.query('select public.elsie_worker_begin($1,$2)',[j.jobId,j.leaseId]);
 await f.db.query('select public.elsie_worker_receipt($1,123)',[j.jobId]);
 await f.db.query("select public.elsie_worker_reconcile($1,123,'success')",[j.jobId]);
 assert.equal((await f.db.query('select status from public.manager_tasks where id=$1',[j.taskId])).rows[0].status,'waiting');
 assert.match((await f.db.query('select detail from public.office_notes')).rows[0].detail,/Not a live-release/);
 const next=await f.claim();assert.equal(next.state,'leased');assert.notEqual(next.taskId,j.taskId);
 await assert.rejects(f.db.query("select public.elsie_worker_reconcile($1,123,'success')",[j.jobId]),/unavailable/);
 }finally{await f.db.close();}
});
test('task change after lease is rejected before any external dispatch',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);const j=await f.claim();
 await f.db.query("update public.manager_tasks set risk='red' where id=$1",[j.taskId]);
 assert.equal((await f.db.query('select public.elsie_worker_begin($1,$2) as ok',[j.jobId,j.leaseId])).rows[0].ok,false);
 }finally{await f.db.close();}
});
test('database uniqueness prevents two active jobs on the same builder',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);await f.claim();
 await assert.rejects(f.db.query("update canx_private.elsie_work_jobs set state='attempted' where session_id=$1 and state='queued'",[sid]),/elsie_one_active_builder/);
 }finally{await f.db.close();}
});
test('expired pre-dispatch lease is blocked without re-reserving or reattempting that task',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);const j=await f.claim();
 await f.db.query("update canx_private.elsie_work_jobs set lease_until=now()-interval '1 minute' where id=$1",[j.jobId]);
 const next=await f.claim();assert.notEqual(next.taskId,j.taskId);
 assert.equal((await f.db.query('select state from canx_private.elsie_work_jobs where id=$1',[j.jobId])).rows[0].state,'blocked');
 assert.equal((await f.db.query('select count(*)::int as n from public.ai_usage')).rows[0].n,2);
 }finally{await f.db.close();}
});
test('budget reads and reservations use the same committed ledger',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.budget();await f.worker(sid);
 await f.db.exec('update public.ai_limits set max_cents_per_day=100');await f.claim();
 const j=(await f.db.query("select id from canx_private.elsie_work_jobs where state='leased'")).rows[0];
 await f.db.query("update canx_private.elsie_work_jobs set state='blocked' where id=$1",[j.id]);
 assert.equal((await f.claim()).reason,'budget_limit');assert.equal((await f.db.query('select count(*)::int as n from public.ai_usage')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('an independent replacement process reads the durable attempted state and cannot claim it again',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'canx-worker-ledger-'));let db;
 try{
 const f=await fixture(dir);db=f.db;const sid=await f.enroll();await f.budget();await f.worker(sid);const j=await f.claim();
 await db.query('select public.elsie_worker_begin($1,$2)',[j.jobId,j.leaseId]);await db.close();db=null;
 const module=process.env.CANX_PGLITE_MODULE;
 const script=`import {PGlite} from ${JSON.stringify(module)};const db=new PGlite(${JSON.stringify(dir)});await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'elsie_worker',elsie_session:${JSON.stringify(sid)}})]);console.log(JSON.stringify((await db.query("select public.elsie_worker_claim('claude') as result")).rows[0].result));await db.close();`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);
 assert.equal(JSON.parse(child.stdout.trim()).reason,'builder_busy_or_uncertain');
 }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});
test('the scoped PostgREST role can call its RPC but cannot select private ledger rows',async()=>{
 const f=await fixture();try{const sid=await f.enroll();await f.worker(sid);await f.db.exec('set role elsie_worker');
 assert.equal((await f.claim()).reason,'authoritative_spending_unavailable');
 await assert.rejects(f.db.query('select * from canx_private.elsie_work_jobs'),/permission denied/);
 await f.db.exec('reset role');
 }finally{await f.db.close();}
});
test('owner status and stop are withheld from the worker role',async()=>{
 const f=await fixture();try{const sid=await f.enroll();const saved=(await f.db.query('select public.elsie_worker_status() as s')).rows[0].s;assert.equal(saved.sessions[0].id,sid);
 await f.worker(sid);await assert.rejects(f.db.query('select public.elsie_worker_status()'),/MFA/);await assert.rejects(f.db.query('select public.elsie_worker_stop($1)',[sid]),/MFA/);
 }finally{await f.db.close();}
});
