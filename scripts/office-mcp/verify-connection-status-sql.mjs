// Isolated Postgres check of supabase/migrations/20261011030000_office_mcp_connection_status.sql. Never touches the live Office.
// Run: CANX_TEST_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/office-mcp/verify-connection-status-sql.mjs
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.CANX_TEST_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const owner = U(1), stranger = U(9), cChat = U(41), cClaude = U(42), sChat = U(51), sOwnerBrowser = U(52);
const migration = (f) => readFile(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8");
const as = async (c) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(c)]); await db.exec("set role authenticated"); };
const status = async () => (await db.query("select * from public.canx_mcp_connection_status()")).rows;
try {
  await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  grant usage on schema public, auth, storage to authenticated;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  create table auth.users(id uuid primary key);
  create table auth.oauth_clients(id uuid primary key, deleted_at timestamptz);
  create table auth.sessions(id uuid primary key, user_id uuid, oauth_client_id uuid, not_after timestamptz, updated_at timestamptz default now());
  create table auth.oauth_consents(id uuid primary key, user_id uuid, client_id uuid, revoked_at timestamptz);
  create table auth.oauth_authorizations(authorization_id text, user_id uuid, client_id uuid, status text, expires_at timestamptz, code_challenge_method text, resource text);
  create type public.app_role as enum('owner');
  create table public.user_roles(user_id uuid, role public.app_role);
  create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
  create function public.session_aal() returns text language sql stable as $$ select auth.jwt()->>'aal' $$;
  create table public.ai_usage(id uuid default gen_random_uuid(), owner_id uuid, estimated_cents int, at timestamptz default now());
  create table public.office_audit(owner_id uuid, action text, entity text, entity_id text, detail jsonb);
  create table storage.objects(id uuid primary key);`);
  await db.exec(await migration("20261008180144_office_mcp_scoped_access.sql"));
  await db.exec(await migration("20261011030000_office_mcp_connection_status.sql"));
  await db.exec(`
  insert into auth.users values ('${owner}'), ('${stranger}');
  insert into public.user_roles values ('${owner}', 'owner');
  insert into auth.oauth_clients(id) values ('${cChat}'), ('${cClaude}');
  insert into canx_private.office_mcp_clients(owner_id, client_id, identity) values ('${owner}', '${cChat}', 'chatgpt'), ('${owner}', '${cClaude}', 'claude');
  insert into auth.oauth_consents values ('${U(61)}', '${owner}', '${cChat}', null), ('${U(62)}', '${owner}', '${cClaude}', null);
  insert into auth.sessions(id, user_id, oauth_client_id) values ('${sChat}', '${owner}', '${cChat}'), ('${sOwnerBrowser}', '${owner}', null);`);
  const ownerBrowser = { sub: owner, role: "authenticated", aal: "aal1" };
  await as(ownerBrowser);
  const rows = await status();
  assert.deepEqual(rows.map((r) => [r.identity, r.enabled, r.consent_active, r.live_sessions]), [["chatgpt", true, true, 1], ["claude", true, true, 0]]);
  assert.ok(rows[0].last_active_at instanceof Date); assert.equal(rows[1].last_active_at, null);
  // Owner's own browser session is not counted as an assistant sign-in.
  await db.exec("reset role"); await db.exec(`update auth.sessions set not_after = now() - interval '1 minute' where id = '${sChat}'`);
  await as(ownerBrowser); assert.equal((await status())[0].live_sessions, 0);
  await db.exec("reset role"); await db.exec(`update auth.oauth_consents set revoked_at = now() where client_id = '${cClaude}'`);
  await as(ownerBrowser); assert.equal((await status())[1].consent_active, false);
  // Refused for an assistant's own token, a non-owner and anonymous callers.
  await as({ ...ownerBrowser, client_id: cChat, session_id: sChat }); await assert.rejects(status());
  await as({ sub: stranger, role: "authenticated" }); await assert.rejects(status());
  await db.exec("reset role"); await db.exec("set role anon"); await assert.rejects(status());
  // Read-only: nothing was written.
  await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int c from public.office_audit")).rows[0].c, 0);
  assert.equal((await db.query("select count(*)::int c from canx_private.office_mcp_clients where enabled")).rows[0].c, 2);
  console.log("Isolated SQL fixtures passed: connected vs signed-out vs expired vs revoked consent; owner browser session not counted; assistant tokens, non-owners and anonymous callers refused; nothing written. No live records touched.");
} finally { await db.close(); }
