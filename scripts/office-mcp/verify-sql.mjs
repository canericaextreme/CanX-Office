// Isolated Postgres fixture validation. Never connects to the live Office.
// Install @electric-sql/pglite@0.5.8 in a temporary directory, then set
// CANX_TEST_PGLITE_MODULE to its dist/index.js path when running this script.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.CANX_TEST_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
const uid="00000000-0000-4000-8000-000000000001";
const cid="00000000-0000-4000-8000-000000000002";
const sid="00000000-0000-4000-8000-000000000003";
const other="00000000-0000-4000-8000-000000000004";
try {
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; create schema storage;
 grant usage on schema public,auth,storage to authenticated;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create table auth.users(id uuid primary key);
 create table auth.oauth_clients(id uuid primary key,deleted_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,oauth_client_id uuid,not_after timestamptz);
 create table auth.oauth_consents(id uuid primary key,user_id uuid,client_id uuid,revoked_at timestamptz);
 create table auth.oauth_authorizations(authorization_id text,user_id uuid,client_id uuid,status text,expires_at timestamptz,code_challenge_method text,resource text);
 create type public.app_role as enum('owner');
 create table public.user_roles(user_id uuid,role public.app_role);
 create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
 create function public.session_aal() returns text language sql stable as $$ select auth.jwt()->>'aal' $$;
 create table public.office_notes(id text primary key,owner_id uuid,title text,detail text,source text,kind text,provenance text,updated_at timestamptz default now());
 create table public.manager_tasks(id uuid primary key,owner_id uuid,title text,detail text,status text,project text,risk text,worker text,waiting_reason text,result text,evidence text,updated_at timestamptz default now());
 create table public.ai_usage(id uuid default gen_random_uuid(),owner_id uuid,estimated_cents int,at timestamptz default now(),outcome text default 'reserved',settled_at timestamptz);
 create table public.ai_limits(owner_id uuid primary key,max_calls_per_minute int,max_calls_per_day int,max_cents_per_day int,max_cents_per_month int);
 create table public.office_audit(owner_id uuid,action text,entity text,entity_id text,detail jsonb);
 create table public.finance_receipts(owner_id uuid primary key,doc jsonb,updated_at timestamptz default now());
 create table storage.objects(id uuid primary key);
 alter table public.office_notes enable row level security;
 alter table public.manager_tasks enable row level security;
 create policy own_notes on public.office_notes for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 create policy own_tasks on public.manager_tasks for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 grant select on public.office_notes,public.manager_tasks to authenticated;
 `);
 await db.exec(await readFile(new URL("../../supabase/migrations/20261008180144_office_mcp_scoped_access.sql",import.meta.url),"utf8"));
 await db.exec(await readFile(new URL("../../supabase/migrations/20261008200158_office_mcp_work_access.sql",import.meta.url),"utf8"));
 await db.exec(await readFile(new URL("../../supabase/migrations/20261010023817_office_colleague_relay_work_grant.sql",import.meta.url),"utf8"));
 await db.exec(`
 insert into auth.users values('${uid}');
 insert into public.user_roles values('${uid}','owner');
 insert into auth.oauth_clients(id) values('${cid}');
 insert into auth.sessions(id,user_id,oauth_client_id) values('${sid}','${uid}','${cid}');
 insert into auth.oauth_consents(id,user_id,client_id) values('${sid}','${uid}','${cid}');
 insert into auth.oauth_authorizations values('fixture-request','${uid}','${cid}','approved',now()+interval '1 hour','s256','https://gmsjjiprtulxojhkmbqb.supabase.co/functions/v1/office-mcp');
 insert into public.office_notes(id,owner_id,title,detail,source) values('project','${uid}','Fixture project','PRIVATE DETAIL','Lovable project import'),('private','${uid}','PRIVATE TITLE','PRIVATE DETAIL','Private archive');
 insert into public.manager_tasks(id,owner_id,title,detail,status,project) values('${sid}','${uid}','PRIVATE TASK','PRIVATE DETAIL','open','PRIVATE PROJECT TEXT');
 `);
 const base={sub:uid,role:"authenticated",aal:"aal1",client_id:cid,session_id:sid,iss:"https://gmsjjiprtulxojhkmbqb.supabase.co/auth/v1",aud:"authenticated",exp:Math.floor(Date.now()/1000)+3600};
 const claims=async c=>{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(c)]);};
 const active=async()=> (await db.query("select public.canx_mcp_session_active() as active")).rows[0].active;
 await claims({...base,client_id:undefined,aal:"aal2"});
 assert.equal((await db.query("select public.canx_approve_mcp_client('fixture-request','chatgpt') as id")).rows[0].id,cid);
 await claims(base);assert.equal(await active(),true);
 const snapshot=(await db.query("select public.canx_mcp_office_status() as status")).rows[0].status;
 assert.equal(snapshot.projects.length,1);
 assert.equal(snapshot.tasks.length,1);
 assert.equal(snapshot.tasks[0].project,null);
 assert.equal(JSON.stringify(snapshot).includes("PRIVATE"),false);
 assert.equal(snapshot.buildPermission,false);
 for(const patch of [{client_id:other},{sub:other},{exp:0},{session_id:other},{iss:undefined},{aud:undefined},{role:undefined},{client_id:"malformed"}]) {await claims({...base,...patch});assert.equal(await active(),false);}
 await claims(base);
 await db.exec("set role authenticated");
 assert.equal((await db.query("select count(*)::int as count from public.office_notes")).rows[0].count,0);
 assert.equal((await db.query("select count(*)::int as count from public.manager_tasks")).rows[0].count,0);
 assert.equal(await active(),true);
 await assert.rejects(db.query("select * from canx_private.office_mcp_clients"));
 await claims({...base,client_id:undefined,aal:"aal2"});
 assert.equal((await db.query("select count(*)::int as count from public.office_notes")).rows[0].count,2);
 await db.exec("reset role");
 await claims(base);
 for(const [deny,restore] of [
  ["update auth.oauth_consents set revoked_at=now()","update auth.oauth_consents set revoked_at=null"],
  ["update auth.sessions set not_after=now()-interval '1 minute'","update auth.sessions set not_after=null"],
  ["update canx_private.office_mcp_clients set enabled=false","update canx_private.office_mcp_clients set enabled=true"],
  ["update auth.oauth_clients set deleted_at=now()","update auth.oauth_clients set deleted_at=null"],
  ["delete from public.user_roles",`insert into public.user_roles values('${uid}','owner')`],
 ]) {await db.exec(deny);assert.equal(await active(),false);await assert.rejects(db.query("select public.canx_mcp_office_status()"));await db.exec(restore);assert.equal(await active(),true);}

 await assert.rejects(db.query("select public.canx_office_records('office_notes')"));
 await claims({...base,client_id:undefined,aal:"aal2"});
 assert.equal((await db.query("select public.canx_approve_office_work('fixture-request','chatgpt') as id")).rows[0].id,cid);
 await claims(base);
 const work=async()=> (await db.query("select public.canx_mcp_work_active() as active")).rows[0].active;
 assert.equal(await work(),true);
 await claims({...base,client_id:"bad"});assert.equal(await work(),false);await claims(base);
 await db.exec(`insert into public.office_notes(id,owner_id,title,detail) values('other','${other}','NOT MINE','FOREIGN'); insert into public.finance_receipts values('${uid}','{"subscriptions":[1],"receipts":[2]}',now());`);
 const rows=(await db.query("select public.canx_office_records('office_notes') as r")).rows[0].r;
 assert.equal(rows.records.length,2);assert.equal(JSON.stringify(rows).includes('PRIVATE DETAIL'),true);assert.equal(JSON.stringify(rows).includes('FOREIGN'),false);
 await assert.rejects(db.query("select public.canx_office_records('user_roles')"));
 await assert.rejects(db.query("select public.canx_office_records('office_notes',null,null,null)"));
 const priv=rows.records.find(r=>r.data.id==='private');
 await assert.rejects(db.query("select public.canx_write_office_record('office_notes','private','{\"detail\":\"changed\"}','stale')"));
 const updated=(await db.query("select public.canx_write_office_record('office_notes','private',$1::jsonb,$2) as r",[JSON.stringify({detail:'changed'}),priv.version])).rows[0].r;
 assert.equal(updated.data.detail,'changed');
 await assert.rejects(db.query("select public.canx_write_office_record('office_notes','private',$1::jsonb,$2)",[JSON.stringify({owner_id:other}),updated.version]));
 const fin=(await db.query("select public.canx_office_records('finance_receipts') as r")).rows[0].r.records[0];
 const saved=(await db.query("select public.canx_write_office_record('finance_receipts',$1,$2::jsonb,$3) as r",[uid,JSON.stringify({doc:{receipts:[3]}}),fin.version])).rows[0].r;
 assert.deepEqual(saved.data.doc,{subscriptions:[1],receipts:[3]});
 const bid='00000000-0000-4000-8000-000000000008';
 const claim=async()=> (await db.query("select public.canx_mcp_claim_build($1,'codex','Build a test interface') as r",[bid])).rows[0].r;
 assert.equal((await claim()).dispatch,true);assert.equal((await claim()).dispatch,false);
 await assert.rejects(db.query("select public.canx_mcp_claim_build($1,'claude','Build a test interface')",[bid]));
 await db.query("select public.canx_mcp_finish_build($1,'{\"ok\":true}'::jsonb)",[bid]);assert.deepEqual((await claim()).result,{ok:true});
 // Delegated relay: protected writes, exact CAS, preserved history and budgets.
 await db.exec(`update public.manager_tasks set risk='green',result='Earlier',evidence='Earlier evidence',updated_at=now()-interval '5 minutes'; insert into public.ai_limits values('${uid}',6,200,500,10000);`);
 await db.exec('set role authenticated');
 const relayId='11111111-2222-4333-8444-555555555555';
 const task=async()=> (await db.query("select public.canx_office_records('manager_tasks',$1) as r",[sid])).rows[0].r.records[0].data;
 const before=await task();
 const at=new Date(Date.now()-2000).toISOString();
 const evidence=before.evidence+`\n\n[colleague-relay ${relayId} claimed claude ${at}]`;
 const save=async(expected,patch)=>(await db.query('select public.canx_mcp_relay_save($1,$2,$3::jsonb) as r',[sid,expected,JSON.stringify(patch)])).rows[0].r;
 await assert.rejects(save(before.updated_at,{evidence:'OVERWRITE',updated_at:at}));
 await assert.rejects(save(before.updated_at,{evidence,updated_at:at,status:'done'}));
 assert.equal((await save(before.updated_at,{evidence,updated_at:at})).length,1);
 assert.equal((await save(before.updated_at,{evidence,updated_at:at})).length,0);
 const result=before.result+`\n\n[colleague-relay ${relayId} reply claude ${at}]\nReceived`;
 const finishAt=new Date().toISOString();
 const receipt=evidence+`\n\nRelay receipt ${relayId}: Anthropic response msg_fixture; model fixture.`;
 assert.equal((await save(at,{evidence:receipt,result,updated_at:finishAt})).length,1);
 const finished=await task();assert.equal(finished.result,result);assert.equal(finished.status,'open');
 assert.equal((await save(finishAt,{evidence:receipt+`\n\n[colleague-relay ${relayId} claimed claude ${at}]`,updated_at:new Date(Date.now()+1000).toISOString()})).length,0);
 const reserve=async(c)=>(await db.query('select * from public.canx_mcp_relay_reserve($1)',[c])).rows[0];
 assert.equal((await reserve(-1)).allowed,false);
 const reservation=await reserve(4);assert.equal(reservation.allowed,true);
 await db.query("select public.canx_mcp_relay_settle($1,'ok')",[reservation.reservation_id]);
 await db.exec('reset role');
 assert.equal((await db.query('select outcome from public.ai_usage where id=$1',[reservation.reservation_id])).rows[0].outcome,'ok');
 await db.exec(`update public.ai_limits set max_cents_per_month=4`);
 assert.equal((await reserve(4)).reason,'budget_limit');
 await db.exec(`update public.manager_tasks set risk='yellow'`);
 await assert.rejects(save(finishAt,{evidence:receipt,updated_at:new Date(Date.now()+1000).toISOString()}));
 await claims({...base,sub:other});await assert.rejects(save(finishAt,{evidence:receipt,updated_at:at}));assert.equal((await reserve(4)).allowed,false);await claims(base);
 await db.exec('set role anon');await assert.rejects(save(finishAt,{evidence:receipt,updated_at:at}));await db.exec('reset role');
 await db.exec("update auth.oauth_consents set revoked_at=now()");assert.equal(await work(),false);await assert.rejects(db.query("select public.canx_office_records('office_notes')"));await db.exec("update auth.oauth_consents set revoked_at=null");
 await db.exec("delete from auth.sessions");assert.equal(await active(),false);
 console.log("Isolated SQL fixtures passed: owner consent, current session/grant, narrow saved metadata, direct-record denial, unchanged normal-owner access, expiry, revocation, removed owner and sign-out denial. Relay claim/save, stale versions, duplicate IDs, foreign/revoked clients, unchanged budgets and anonymous denial also passed. No live records touched.");
} finally {await db.close();}
