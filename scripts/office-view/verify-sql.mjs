// Isolated Postgres check of docs/proposed/office-view-delegation.sql. Never touches the live Office.
// Run: CANX_TEST_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/office-view/verify-sql.mjs
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const { PGlite } = await import(process.env.CANX_TEST_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
const rawQuery = db.query.bind(db);
db.query = async (q, p) => { try { return await rawQuery(q, p); } catch (e) { e.lastSql = String(q).slice(0, 160); throw e; } }; // LAST_SQL helps locate failures
const rawExec = db.exec.bind(db);
db.exec = async (q) => { try { return await rawExec(q); } catch (e) { e.lastSql = String(q).slice(0, 160); throw e; } };
const U = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const owner = U(1), vClaude = U(11), vChat = U(12), vElsie = U(13), stranger = U(99);
const cClaude = U(41), cChat = U(42), oauthClaude = U(51), oauthChat = U(52), authClaude = U(31), authChat = U(32);
const ROUTES = ["/reception","/owner-desk","/brain","/idea-garage","/projects","/safe-highways","/work-board","/office-team","/build-testing","/finance","/subscriptions","/communications","/legal","/records","/skills","/systems","/health","/approvals","/blueprint","/future","/family-continuity","/analytics","/round-table","/research"];

const claims = (c) => db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(c)]);
const as = async (role, c) => { await db.exec("reset role"); await claims(c ?? {}); if (role) await db.exec(`set role ${role}`); };
const count = async (t) => (await db.query(`select count(*)::int c from ${t}`)).rows[0].c;
const ownerJwt = (aal = "aal2", extra = {}) => ({ sub: owner, role: "authenticated", aal, ...extra });
const viewerJwt = (sub, session) => ({ sub, role: "authenticated", aal: "aal1", session_id: session });
const denied = async (label, sql, params) => { await assert.rejects(db.query(sql, params), undefined, label); };
const ISS = 'https://gmsjjiprtulxojhkmbqb.supabase.co/auth/v1';
const connectorJwt = (client, session) => ({ sub: owner, role: 'authenticated', aal: 'aal1', iss: ISS, aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, client_id: client, session_id: session });
const log = [];
const pass = (m) => { log.push(m); if (process.env.DEBUG_STEPS) console.error("ok:", m.slice(0, 70)); };

try {
  await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema storage;
  grant usage on schema public, auth, storage to authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  create table auth.users(id uuid primary key);
  create table auth.oauth_clients(id uuid primary key, deleted_at timestamptz);
  create table auth.sessions(id uuid primary key, user_id uuid, oauth_client_id uuid, not_after timestamptz);
  create table auth.oauth_consents(id uuid primary key, user_id uuid, client_id uuid, revoked_at timestamptz);
  create table auth.oauth_authorizations(authorization_id text, user_id uuid, client_id uuid, status text, expires_at timestamptz, code_challenge_method text, resource text);
  create table storage.objects(id uuid primary key);
  create table storage.buckets(id text primary key, name text, public boolean);
  create type public.app_role as enum('owner','admin','member');
  create table public.user_roles(user_id uuid, role public.app_role);
  create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
  create function public.session_aal() returns text language sql stable as $$ select coalesce(auth.jwt()->>'aal','aal1') $$;
  create function public.is_verified_owner() returns boolean language sql stable security definer set search_path=public as $$ select auth.jwt()->>'client_id' is null and public.has_role(auth.uid(),'owner') and public.session_aal()='aal2' $$;
  create table public.office_notes(id text primary key, owner_id uuid, kind text, title text, detail text, source text, updated_at timestamptz default now());
  create table public.office_files(id text primary key, owner_id uuid, room text, filename text);
  create table public.office_links(id text primary key, owner_id uuid, room text, title text);
  create table public.manager_tasks(id text primary key, owner_id uuid, title text, status text, project text, updated_at timestamptz default now());
  create table public.manager_approvals(id text primary key, owner_id uuid, title text);
  create table public.manager_changes(id text primary key, owner_id uuid, action text);
  create table public.round_tables(id text primary key, owner_id uuid, key text);
  create table public.finance_receipts(owner_id uuid primary key, doc jsonb);
  create table public.knowledge_documents(id text primary key, owner_id uuid, title text);
  create table public.knowledge_document_sections(id text primary key, owner_id uuid, body text);
  create table public.office_audit(at timestamptz default now(), owner_id uuid, action text, entity text, entity_id text, detail jsonb);
  create table public.ai_usage(id uuid default gen_random_uuid(), owner_id uuid, estimated_cents int, at timestamptz default now(), outcome text default 'reserved', settled_at timestamptz);
  create table public.ai_limits(owner_id uuid primary key, max_calls_per_minute int, max_calls_per_day int, max_cents_per_day int, max_cents_per_month int);
  `);
  // Existing production behaviour, reproduced: owner-only policies that need the authenticator, plus the
  // restrictive "no OAuth client" policy on every public table.
  for (const t of ["office_notes","office_files","office_links","manager_tasks","manager_approvals","manager_changes","round_tables","finance_receipts","knowledge_documents","knowledge_document_sections","office_audit","ai_usage","ai_limits","user_roles"]) {
    await db.exec(`alter table public.${t} enable row level security;
      grant select, insert, update, delete on public.${t} to authenticated;
      `);
    if (!["user_roles","office_audit","ai_usage","ai_limits"].includes(t))
      await db.exec(`create policy owner_all on public.${t} for all to authenticated using (owner_id=(select auth.uid()) and public.is_verified_owner()) with check (owner_id=(select auth.uid()) and public.is_verified_owner());`);
  }
  await db.exec(`create policy own_roles on public.user_roles for select to authenticated using (user_id=auth.uid());`);
  await db.exec(`create policy owner_audit on public.office_audit for select to authenticated using (owner_id=auth.uid() and public.is_verified_owner());`);

  // The real production migration: restrictive "no OAuth client" policy on every table, is_verified_owner, connector approval.
  await db.exec(await readFile(new URL("../../supabase/migrations/20261008180144_office_mcp_scoped_access.sql", import.meta.url), "utf8"));
  const sql = await readFile(new URL("../../docs/proposed/office-view-delegation.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(`grant execute on all functions in schema public to service_role;`);

  await db.exec(`
  insert into auth.users values ('${owner}'),('${vClaude}'),('${vChat}'),('${vElsie}'),('${stranger}');
  insert into public.user_roles values ('${owner}','owner');
  insert into public.office_notes values
    ('n-general','${owner}','task','General note','GENERAL DETAIL','Shared note'),
    ('n-legal','${owner}','task','Legal filing','LEGAL DETAIL','Legal room: document filing'),
    ('n-proj','${owner}','task','Project','PROJECT DETAIL','Lovable project import'),
    ('n-brain','${owner}','task','Brain memory','BRAIN DETAIL','CanX Brain: continuity');
  insert into public.office_files values ('f1','${owner}','reception','a.pdf'),('f2','${owner}','finance','b.pdf'),('f3','${owner}','project-rooms','c.pdf');
  insert into public.manager_tasks values ('t1','${owner}','Task');
  insert into public.finance_receipts values ('${owner}','{"receipts":[1]}');
  insert into public.round_tables values ('r1','${owner}','Agenda');
  insert into public.knowledge_documents values ('k1','${owner}','Doc');
  insert into public.manager_approvals values ('a1','${owner}','Appr');
  `);

  await db.exec(`
  insert into auth.oauth_clients(id) values ('${cClaude}'),('${cChat}');
  insert into auth.sessions(id,user_id,oauth_client_id) values ('${oauthClaude}','${owner}','${cClaude}'),('${oauthChat}','${owner}','${cChat}');
  insert into auth.oauth_consents(id,user_id,client_id) values ('${oauthClaude}','${owner}','${cClaude}'),('${oauthChat}','${owner}','${cChat}');
  insert into auth.oauth_authorizations values ('req-claude','${owner}','${cClaude}','approved',now()+interval '1 hour','s256','https://gmsjjiprtulxojhkmbqb.supabase.co/functions/v1/office-mcp'),
    ('req-chat','${owner}','${cChat}','approved',now()+interval '1 hour','s256','https://gmsjjiprtulxojhkmbqb.supabase.co/functions/v1/office-mcp');
  `);
  await as("authenticated", { sub: owner, role: "authenticated", aal: "aal2", iss: ISS, aud: "authenticated", exp: Math.floor(Date.now()/1000)+3600 });
  await db.query("select public.canx_approve_mcp_client('req-claude','claude')");
  await db.query("select public.canx_approve_mcp_client('req-chat','chatgpt')");

  // ---- 1. Granting needs the authenticator, the owner, and a separate viewer identity.
  const grant = (a, v, rooms, days = 30) => db.query("select public.canx_view_grant_set($1,$2,$3,$4)", [a, v, rooms, days]);
  await as("authenticated", ownerJwt("aal1"));
  await denied("grant without authenticator", "select public.canx_view_grant_set('claude',$1,$2,30)", [vClaude, ["/brain"]]);
  await as("authenticated", ownerJwt("aal2", { client_id: U(50) }));
  await denied("grant by an OAuth client", "select public.canx_view_grant_set('claude',$1,$2,30)", [vClaude, ["/brain"]]);
  await as("authenticated", viewerJwt(vClaude, authClaude));
  await denied("grant by a viewer", "select public.canx_view_grant_set('claude',$1,$2,30)", [vClaude, ["/brain"]]);
  await as("authenticated", ownerJwt("aal2"));
  await denied("owner as viewer", "select public.canx_view_grant_set('claude',$1,$2,30)", [owner, ["/brain"]]);
  await denied("unknown room", "select public.canx_view_grant_set('claude',$1,$2,30)", [vClaude, ["/nowhere"]]);
  await denied("too long", "select public.canx_view_grant_set('claude',$1,$2,91)", [vClaude, ["/brain"]]);
  await denied("no days", "select public.canx_view_grant_set('claude',$1,$2,0)", [vClaude, ["/brain"]]);
  await denied("unknown assistant", "select public.canx_view_grant_set('gemini',$1,$2,30)", [vClaude, ["/brain"]]);
  await denied("missing viewer account", "select public.canx_view_grant_set('claude',$1,$2,30)", [U(77), ["/brain"]]);
  await denied("empty scope", "select public.canx_view_grant_set('claude',$1,$2,30,$3)", [vClaude, ["/brain"], []]);
  await denied("unknown scope", "select public.canx_view_grant_set('claude',$1,$2,30,$3)", [vClaude, ["/brain"], ["modify_records"]]);
  await denied("empty rooms", "select public.canx_view_grant_set('claude',$1,$2,30)", [vClaude, []]);
  pass("granting needs owner + authenticator + a separate viewer account; bad rooms, lengths, assistants refused");

  await grant("claude", vClaude, ["/brain", "/reception", "/legal"], 30);
  await grant("chatgpt", vChat, ["/reception", "/finance"], 30);
  await denied("viewer account reused by another assistant", "select public.canx_view_grant_set('elsie',$1,$2,30)", [vClaude, ["/brain"]]);
  await grant("elsie", vElsie, ROUTES, 7);

  // ---- 2. Without a capture session, a viewer reads nothing.
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0);
  assert.equal(await count("public.manager_tasks"), 0);
  pass("a viewer with a standing grant but no capture session reads nothing");

  // ---- 2b. Reading scope is chosen per assistant and enforced.
  await as("authenticated", ownerJwt("aal2"));
  await db.query("select public.canx_view_grant_set('elsie',$1,$2,7,$3)", [vElsie, ROUTES, ["read_room_information"]]);
  await as("authenticated", ownerJwt("aal1"));
  await assert.rejects(db.query("select public.canx_view_request_create_elsie('/brain','desktop','default','image')"), (e) => String(e.message).includes("wrong_permission"));
  await db.query("select public.canx_view_request_create_elsie('/brain','desktop','default','information')");
  await db.query("delete from public.office_audit where false");
  await as("authenticated", ownerJwt("aal2"));
  await db.query("select public.canx_view_grant_set('elsie',$1,$2,7)", [vElsie, ROUTES]);
  pass("an information-only grant can read but cannot ask for images; scopes are validated");

  // ---- 3. Requests, claim, bind.
  const svc = () => as("service_role", {});
  // How each assistant asks. The assistant's NAME comes from the owner's connector approval, not from the caller.
  const ask = async (a, route, vp = "desktop", state = "default") => {
    if (a === "claude") await as("authenticated", connectorJwt(cClaude, oauthClaude));
    else if (a === "chatgpt") await as("authenticated", connectorJwt(cChat, oauthChat));
    else await as("authenticated", ownerJwt("aal1"));
    const fn = a === "elsie" ? "canx_view_request_create_elsie" : "canx_view_request_create";
    return (await db.query(`select public.${fn}($1,$2,$3) as id`, [route, vp, state])).rows[0].id;
  };
  const claim = async (rid) => { await svc(); return (await db.query("select * from public.canx_view_request_claim($1)", [rid])).rows[0]; };
  const issue = async (a, route, _purpose = "image") => (await claim(await ask(a, route))).session_id;
  const bind = (sid, auth) => db.query("select public.canx_view_session_bind($1,$2)", [sid, auth]);
  const reason = (e, code) => String(e.message).includes(code);

  // Viewers, owners and OAuth clients cannot reach the server-only functions.
  for (const who of [ownerJwt("aal2"), viewerJwt(vClaude, authClaude), connectorJwt(cClaude, oauthClaude)]) {
    await as("authenticated", who);
    await denied("claim by client", "select * from public.canx_view_request_claim($1)", [U(60)]);
    await denied("bind by client", "select public.canx_view_session_bind($1,$2)", [U(60), U(61)]);
    await denied("fail by client", "select public.canx_view_request_fail($1,'x')", [U(60)]);
    await denied("purge by client", "select * from public.canx_view_capture_purge()");
    await denied("fetch by client", "select * from public.canx_view_capture_fetch($1,'claude',$2)", [owner, U(62)]);
    await denied("record by client", "select public.canx_view_capture_record($1,'{}'::jsonb,'x')", [U(60)]);
    await denied("make private", "select canx_private.view_request_make($1,'claude','/brain','desktop','default')", [owner]);
  }
  await as("anon", {});
  await denied("request by anonymous", "select public.canx_view_request_create('/brain','desktop','default')");

  // Request refusals use stable reason codes and never reveal more.
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  const refuse = async (route, vp, st, code) => assert.rejects(db.query("select public.canx_view_request_create($1,$2,$3)", [route, vp, st]), (e) => reason(e, code), `${route} ${vp} ${st} -> ${code}`);
  await refuse("/finance", "desktop", "default", "room_not_granted");
  await refuse("/nowhere", "desktop", "default", "unknown_room");
  await refuse("/brain", "tablet", "default", "bad_request");
  await refuse("/brain", "desktop", "hovering", "bad_request");
  await refuse(null, "desktop", "default", "unknown_room");
  // An OAuth token that is unknown, foreign or signed out is refused.
  for (const bad of [connectorJwt(U(50), oauthClaude), connectorJwt(cClaude, U(53)), { ...connectorJwt(cClaude, oauthClaude), sub: stranger }, { ...connectorJwt(cClaude, oauthClaude), client_id: undefined }]) {
    await as("authenticated", bad);
    await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default')"), (e) => reason(e, "connector_inactive"));
  }
  await as(null, {});
  await db.exec(`update auth.sessions set not_after = now() - interval '1 minute' where id = '${oauthClaude}'`);
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default')"), (e) => reason(e, "connector_inactive"));
  await as(null, {});
  await db.exec(`update auth.sessions set not_after = null where id = '${oauthClaude}'`);
  // A name passed by the caller means nothing: the function takes no assistant argument.
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default','image','chatgpt')"));
  // Viewer and stranger identities cannot request.
  await as("authenticated", viewerJwt(vClaude, authClaude));
  await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default')"), (e) => reason(e, "connector_inactive"));
  await denied("viewer asks as Elsie", "select public.canx_view_request_create_elsie('/brain','desktop','default')");
  await as("authenticated", { sub: stranger, role: "authenticated" });
  await denied("stranger asks as Elsie", "select public.canx_view_request_create_elsie('/brain','desktop','default')");
  await as("authenticated", ownerJwt("aal2", { client_id: U(50) }));
  await denied("OAuth client asks as Elsie", "select public.canx_view_request_create_elsie('/brain','desktop','default')");
  pass("requests: only the approved connector or Elsie can ask; ungranted/unknown rooms, bad views, dead or foreign tokens refused; the assistant name cannot be supplied");

  // Who am I: the name comes from the owner's approval.
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  assert.equal((await db.query("select assistant from public.canx_view_whoami()")).rows[0].assistant, "claude");
  await as("authenticated", connectorJwt(cChat, oauthChat));
  assert.equal((await db.query("select assistant from public.canx_view_whoami()")).rows[0].assistant, "chatgpt");
  await as("authenticated", ownerJwt("aal1"));
  assert.equal((await db.query("select assistant from public.canx_view_whoami(true)")).rows[0].assistant, "elsie");
  await denied("owner is not a connector", "select * from public.canx_view_whoami()");
  await as("authenticated", viewerJwt(vClaude, authClaude));
  await denied("viewer is not a connector", "select * from public.canx_view_whoami()");
  await denied("viewer is not Elsie", "select * from public.canx_view_whoami(true)");
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  await denied("connector cannot claim to be Elsie", "select * from public.canx_view_whoami(true)");

  // Claim: once only, and the grant is re-checked at claim time.
  const rid = await ask("claude", "/brain");
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  assert.equal((await db.query("select status from public.canx_view_request_status($1)", [rid])).rows[0].status, "queued");
  await as("authenticated", connectorJwt(cChat, oauthChat));
  assert.equal((await db.query("select status from public.canx_view_request_status($1)", [rid])).rows.length, 0, "ChatGPT cannot see Claude's request");
  await as("authenticated", ownerJwt("aal1"));
  assert.equal((await db.query("select status from public.canx_view_request_status($1,true)", [rid])).rows.length, 0, "Elsie cannot see Claude's request");
  const c1 = await claim(rid);
  assert.equal(c1.assistant, "claude"); assert.equal(c1.route, "/brain"); assert.equal(c1.viewer_user_id, vClaude);
  await assert.rejects(claim(rid), (e) => reason(e, "request_already_claimed"));
  await assert.rejects(claim(U(63)), (e) => reason(e, "unknown_request"));
  const sess = c1.session_id;
  // Queued request that expires before claim.
  const ridOld = await ask("claude", "/brain");
  await as(null, {});
  await db.exec(`update canx_private.office_view_requests set expires_at = now() - interval '1 second' where id = '${ridOld}'`);
  await assert.rejects(claim(ridOld), (e) => reason(e, "request_expired"));
  // Grant revoked between request and claim.
  const ridRev = await ask("chatgpt", "/reception");
  await as(null, {});
  await db.exec(`update canx_private.office_view_grants set enabled=false, revoked_at=now() where assistant='chatgpt'`);
  await assert.rejects(claim(ridRev), (e) => reason(e, "grant_not_active"));
  await as(null, {});
  await db.exec(`update canx_private.office_view_grants set enabled=true, revoked_at=null where assistant='chatgpt'`);
  pass("a request can be claimed once; expiry and revocation between request and claim refuse it; other assistants cannot see it");

  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0, "claimed but not bound reads nothing");
  await svc();
  await bind(sess, authClaude);
  await assert.rejects(bind(sess, U(33)), (e) => reason(e, "session_not_bindable"));
  pass("a capture session cannot be bound twice (replay refused)");

  // ---- 4. What a bound viewer can and cannot read.
  await as("authenticated", viewerJwt(vClaude, authClaude));
  const ids = async (t) => (await db.query(`select id from ${t} order by id`)).rows.map((r) => r.id);
  assert.deepEqual(await ids("public.office_notes"), ["n-brain", "n-general", "n-legal"]);
  assert.deepEqual(await ids("public.office_files"), ["f1"], "files only from granted rooms");
  assert.equal(await count("public.finance_receipts"), 0, "Finance not granted");
  assert.equal(await count("public.knowledge_documents"), 1, "Brain granted");
  assert.equal(await count("public.round_tables"), 0, "Round Table not granted");
  assert.equal(await count("public.manager_tasks"), 1);
  assert.equal(await count("public.user_roles"), 0, "viewer cannot read roles");
  assert.equal(await count("public.office_audit"), 0, "viewer cannot read the audit log");
  await denied("viewer reads private grants", "select * from canx_private.office_view_grants");
  await denied("viewer reads private sessions", "select * from canx_private.office_view_sessions");
  await denied("viewer reads private captures", "select * from canx_private.office_view_captures");
  pass("viewer reads only granted rooms; roles, audit and private tables stay hidden");

  // A viewer session can confirm itself; nobody else gets an answer.
  const selfRow = (await db.query("select * from public.canx_view_self()")).rows;
  assert.equal(selfRow.length, 1); assert.equal(selfRow[0].assistant, "claude"); assert.equal(selfRow[0].owner_id, owner);
  await as("authenticated", viewerJwt(vClaude, U(99)));
  assert.equal((await db.query("select * from public.canx_view_self()")).rows.length, 0, "a wrong session confirms nothing");
  await as("authenticated", ownerJwt("aal2"));
  assert.equal((await db.query("select * from public.canx_view_self()")).rows.length, 0, "the owner is not a viewer");
  await as("authenticated", viewerJwt(vClaude, authClaude));

  // ---- 5. Read-only: every write is refused.
  const writes = [
    "insert into public.office_notes values ('x','" + owner + "','task','t','d','s')",
    "update public.office_notes set title='changed'",
    "delete from public.office_notes",
    "insert into public.manager_tasks values ('x','" + owner + "','t')",
    "update public.manager_tasks set title='changed'",
    "delete from public.manager_tasks",
    "update public.finance_receipts set doc='{}'",
    "insert into public.office_audit(owner_id,action) values ('" + owner + "','forged')",
    "insert into public.user_roles values ('" + vClaude + "','owner')",
    "update public.user_roles set role='owner'",
  ];
  for (const w of writes) {
    let changed = 0, failed = false;
    try { changed = (await db.query(w)).affectedRows ?? 0; } catch { failed = true; }
    assert.ok(failed || changed === 0, `write must not change anything: ${w}`);
  }
  await as(null, {});
  assert.equal(await count("public.office_notes"), 4);
  assert.equal((await db.query("select title from public.office_notes where id='n-general'")).rows[0].title, "General note");
  assert.equal(await count("public.user_roles"), 1);
  assert.equal((await db.query("select count(*)::int c from public.office_audit where action='forged'")).rows[0].c, 0);
  pass("a viewer's credential cannot write, delete, forge audit rows or give itself a role");

  // ---- 6. Wrong identity, wrong session, expiry, closing.
  await as("authenticated", viewerJwt(vChat, authClaude));
  assert.equal(await count("public.office_notes"), 0, "another assistant cannot use Claude's session");
  await as("authenticated", viewerJwt(vClaude, authChat));
  assert.equal(await count("public.office_notes"), 0, "a different auth session reads nothing");
  await as("authenticated", { ...viewerJwt(vClaude, authClaude), client_id: U(50) });
  assert.equal(await count("public.office_notes"), 0, "an OAuth client token reads nothing");
  await as("authenticated", { ...viewerJwt(stranger, authClaude) });
  assert.equal(await count("public.office_notes"), 0, "a stranger reads nothing");
  await as(null, {});
  await db.exec(`update canx_private.office_view_sessions set expires_at = now() - interval '1 second' where id = '${sess}'`);
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0, "expired session reads nothing");
  await as(null, {});
  await db.exec(`update canx_private.office_view_sessions set expires_at = now() + interval '5 minutes', closed_at = now() where id = '${sess}'`);
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0, "closed session reads nothing");
  await as(null, {});
  await db.exec(`update canx_private.office_view_sessions set closed_at = null where id = '${sess}'`);
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 3, "restored session reads again");
  pass("another assistant, another session, an OAuth token, a stranger, an expired or a closed session all read nothing");

  // ---- 7. Grant expiry.
  await as(null, {});
  await db.exec(`update canx_private.office_view_grants set delegated_at = now() - interval '2 days', expires_at = now() - interval '1 second' where assistant='claude'`);
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0, "expired grant reads nothing");
  await svc();
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default')"), (e) => reason(e, "grant_expired"));
  await as(null, {});
  await db.exec(`update canx_private.office_view_grants set expires_at = now() + interval '5 days' where assistant='claude'`);
  pass("an expired grant stops reads and new sessions");

  // ---- 8. Captures: record, fetch, cross-assistant, retention.
  const meta = (route, room) => ({ route, room, viewport: { name: "desktop" }, state: "default", buildVersion: "index-x.js", pageHeight: 900, imageSha256: "a".repeat(64), capturedAt: new Date().toISOString() });
  await svc();
  const rec = async (sid, m, path = "claude/c1.png") => (await db.query("select public.canx_view_capture_record($1,$2::jsonb,$3) as id", [sid, JSON.stringify(m), path])).rows[0].id;
  await assert.rejects(rec(sess, meta("/legal", "Legal")), (e) => String(e.message).includes("wrong_route"));
  const cap = await rec(sess, meta("/brain", "Goal & Analytics / CanX Brain"));
  const fetchCap = (a, id) => db.query("select * from public.canx_view_capture_fetch($1,$2,$3)", [owner, a, id]);
  assert.equal((await fetchCap("claude", cap)).rows.length, 1);
  await assert.rejects(fetchCap("chatgpt", cap), (e) => String(e.message).includes("capture_unavailable"));
  await assert.rejects(fetchCap("elsie", cap), (e) => String(e.message).includes("capture_unavailable"));
  await assert.rejects(fetchCap("claude", U(70)), (e) => String(e.message).includes("capture_unavailable"));
  pass("a stored capture is fetchable only by the assistant that requested it");

  // Capture session that is closed after recording cannot read again.
  await as("authenticated", viewerJwt(vClaude, authClaude));
  assert.equal(await count("public.office_notes"), 0, "session closes when the capture is stored");

  // ---- 9. Revocation during capture, before retrieval, and independence.
  await svc();
  const sess2 = await issue("claude", "/reception"); await bind(sess2, U(34));
  const sessChat = await issue("chatgpt", "/reception"); await bind(sessChat, authChat);
  await as("authenticated", viewerJwt(vChat, authChat));
  assert.equal(await count("public.office_files"), 2, "ChatGPT sees Reception and Finance files");
  await as("authenticated", ownerJwt("aal1"));  // revoking needs only a normal sign-in
  await db.query("select public.canx_view_grant_revoke('claude')");
  await as("authenticated", viewerJwt(vClaude, U(34)));
  assert.equal(await count("public.office_notes"), 0, "revoked: reads stop");
  await svc();
  await assert.rejects(rec(sess2, meta("/reception", "Reception")), (e) => String(e.message).includes("revoked_during_capture"));
  await assert.rejects(fetchCap("claude", cap), (e) => String(e.message).includes("revoked"));
  await as("authenticated", connectorJwt(cClaude, oauthClaude));
  await assert.rejects(db.query("select public.canx_view_request_create('/brain','desktop','default')"), (e) => reason(e, "revoked"));
  await svc();
  await as("authenticated", viewerJwt(vChat, authChat));
  assert.equal(await count("public.office_files"), 2, "ChatGPT unaffected by revoking Claude");
  await svc();
  assert.equal((await db.query("select * from public.canx_view_capture_purge()")).rows.length, 1, "revoked captures are queued for deletion");
  assert.equal((await db.query("select * from public.canx_view_capture_purge()")).rows.length, 0, "purge is not repeated");
  pass("revocation stops reads, new sessions, in-flight captures and retrieval of old captures, and leaves other assistants alone");

  // Revoke permissions.
  for (const who of [viewerJwt(vChat, authChat), ownerJwt("aal2", { client_id: U(50) }), { sub: stranger, role: "authenticated" }]) {
    await as("authenticated", who);
    await denied("revoke by a non-owner", "select public.canx_view_grant_revoke('chatgpt')");
  }
  await as("authenticated", ownerJwt("aal1"));
  await denied("revoke unknown", "select public.canx_view_grant_revoke('gemini')");
  const status = (await db.query("select * from public.canx_view_grants_status() order by assistant")).rows;
  assert.deepEqual(status.map((r) => [r.assistant, r.enabled]), [["chatgpt", true], ["claude", false], ["elsie", true]]);
  assert.equal(JSON.stringify(status).includes("session"), false);
  await as("authenticated", viewerJwt(vChat, authChat));
  assert.equal((await db.query("select * from public.canx_view_grants_status()")).rows.length, 0, "a viewer sees no grant status");
  await as("authenticated", ownerJwt("aal2"));
  const hist = (await db.query("select * from public.canx_view_history(50)")).rows;
  assert.ok(hist.some((h) => h.action === "office_view.revoke"));
  assert.ok(hist.some((h) => h.action === "office_view.grant"));
  assert.equal(JSON.stringify(hist).includes("png"), false, "history holds no image data");
  pass("owner sees status and history; viewers and strangers do not; revoke is owner-only");

  // ---- 10. Rate limit.
  await svc();
  for (let i = 0; i < 29; i++) await ask("elsie", "/brain"); // one information request was made earlier
  await as("authenticated", ownerJwt("aal1"));
  await assert.rejects(db.query("select public.canx_view_request_create_elsie('/brain','desktop','default')"), (e) => reason(e, "rate_limited"));
  pass("rate limit of 30 sessions per hour per assistant");

  // ---- 11. The owner is unchanged.
  await as("authenticated", ownerJwt("aal2"));
  assert.equal(await count("public.office_notes"), 4);
  await db.query("update public.office_notes set title='Owner edit' where id='n-general'");
  await as("authenticated", ownerJwt("aal1"));
  assert.equal(await count("public.office_notes"), 0, "owner without authenticator still reads nothing (existing rule kept)");
  pass("the owner's own access and authenticator rules are unchanged");

  // ---- 12. Room list in SQL is the 24 rooms.
  const listed = (await db.query("select unnest(public.canx_view_rooms()) r")).rows.map((r) => r.r);
  assert.deepEqual(listed, ROUTES);
  assert.equal((await db.query("select public.canx_view_room_route('project-rooms') r")).rows[0].r, "/projects");
  pass("SQL room list matches");

  console.log("Office viewing delegation SQL fixtures passed:\n - " + log.join("\n - ") + "\nNo live records touched.");
} catch (e) {
  console.error(e.lastSql ? `${e.message}\n  while running: ${e.lastSql}` : e);
  process.exit(1);
}
