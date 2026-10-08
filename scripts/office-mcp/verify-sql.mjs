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
 create table public.office_notes(id text primary key,owner_id uuid,title text,detail text,source text,updated_at timestamptz default now());
 create table public.manager_tasks(id uuid primary key,owner_id uuid,title text,detail text,status text,project text,updated_at timestamptz default now());
 create table public.ai_usage(owner_id uuid,estimated_cents int,at timestamptz);
 create table public.office_audit(owner_id uuid,action text,entity text,entity_id text,detail jsonb);
 create table storage.objects(id uuid primary key);
 alter table public.office_notes enable row level security;
 alter table public.manager_tasks enable row level security;
 create policy own_notes on public.office_notes for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 create policy own_tasks on public.manager_tasks for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 grant select on public.office_notes,public.manager_tasks to authenticated;
 `);
 await db.exec(await readFile(new URL("../../supabase/migrations/20261008180144_office_mcp_scoped_access.sql",import.meta.url),"utf8"));
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
 await db.exec("delete from auth.sessions");assert.equal(await active(),false);
 console.log("Isolated SQL fixtures passed: owner consent, current session/grant, narrow saved metadata, direct-record denial, unchanged normal-owner access, expiry, revocation, removed owner and sign-out denial. No live records touched.");
} finally {await db.close();}
