// End-to-end check of scripts/capture/run-capture.mjs in a REAL Chromium against stand-in servers.
// Stand-ins: an "Office" that shows a room only when the stored session matches, a broker, and a workflow identity service.
// Never touches the live Office or any real credential. Run from a folder where `playwright` is installed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";

const REQ = "00000000-0000-4000-8000-000000000070";
const SESSION = "00000000-0000-4000-8000-000000000071";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const VIEWER_JWT = `${b64({ alg: "HS256" })}.${b64({ sub: "00000000-0000-4000-8000-000000000011", session_id: "00000000-0000-4000-8000-000000000072", exp: Math.floor(Date.now() / 1000) + 600 })}.sig`;

const world = { scenario: "ok", route: "/brain", viewport: "desktop", state: "default", stored: [], failed: [], prechecks: 0, reported: [], claims: 0 };

const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, "127.0.0.1", () => resolve({ s, port: s.address().port })); });
const body = (req) => new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); });
const send = (res, status, obj, type = "application/json") => { res.writeHead(status, { "content-type": type }); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };

const room = (text, extra = "") => `<!doctype html><meta charset=utf-8><body><div data-canx-office-view><h1>${text}</h1><p>Room contents that are long enough to count as a real page.</p><input value="SECRET-FIELD-VALUE">${extra}</div>
<p data-canx-viewer-badge data-canx-no-capture>Read-only view</p>
<button aria-label="Room synopsis" onclick="document.getElementById('menu').hidden=false">Room synopsis</button>
<div id="menu" hidden role="menu"><div role="menuitem" onclick="document.body.insertAdjacentHTML('beforeend','<div role=dialog>Synopsis</div>')">CanX Brain</div></div>
<script>fetch('https://evil.example/x').then(()=>fetch('/report?exfil=allowed'),()=>fetch('/report?exfil=blocked'))</script></body>`;

const app = await listen(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/report") { world.reported.push(url.searchParams.get("exfil")); return send(res, 200, "ok", "text/plain"); }
  if (url.pathname === "/missing") return send(res, 404, "Not found", "text/plain");
  const page = (inner) => send(res, 200, inner, "text/html; charset=utf-8");
  const shell = (inner) => `<!doctype html><meta charset=utf-8><body><script>
    const s = (()=>{ try { return JSON.parse(localStorage.getItem('canx-office-auth')||'null'); } catch { return null; } })();
    window.__ok = !!s && s.access_token === ${JSON.stringify(VIEWER_JWT)} && !s.refresh_token.includes('owner');
  </script>${inner}</body>`;
  const gated = (r) => `<!doctype html><meta charset=utf-8><body><script>
    const s=(()=>{try{return JSON.parse(localStorage.getItem('canx-office-auth')||'null')}catch{return null}})();
    const ok=!!s&&s.access_token===${JSON.stringify(VIEWER_JWT)};
    document.write(ok?${JSON.stringify(r).replace(/</g, '\\u003c')}:'<section aria-label="CanX Office entrance">Sign in</section>');
  </script></body>`;
  if (world.scenario === "signin") return page(`<!doctype html><meta charset=utf-8><body><section aria-label="CanX Office entrance">Sign in</section></body>`);
  if (world.scenario === "redirect" && url.pathname === "/brain") { res.writeHead(302, { location: "/reception" }); return res.end(); }
  if (world.scenario === "notready") return page(gated(room("Brain", "<p>Saved files could not be loaded.</p>")).replace("</script></body>", "</script></body>"));
  if (world.scenario === "missing" ) return send(res, 404, "Not found", "text/plain");
  if (world.scenario === "blank") return page(gated(`<!doctype html><body><div data-canx-office-view></div><p data-canx-viewer-badge>x</p></body>`));
  const label = url.pathname === "/brain" ? "Brain" : "Room";
  const inner = room(label);
  return page(gated(inner));
});

const oidc = await listen((req, res) => { if (world.scenario === "oidc_down") return send(res, 500, {}); return send(res, 200, { value: "aaa.bbb.ccc" }); });

const broker = await listen(async (req, res) => {
  const route = new URL(req.url, "http://x").pathname.replace(/^\/functions\/v1\/office-view\//, "");
  const data = JSON.parse((await body(req)) || "{}");
  if (!String(req.headers.authorization ?? "").startsWith("Bearer aaa.bbb.ccc")) return send(res, 401, { ok: false, code: "oidc_invalid" });
  if (route === "claim") {
    world.claims++;
    if (world.scenario === "claim_refused") return send(res, 403, { ok: false, code: "request_already_claimed" });
    return send(res, 200, { ok: true, claimed: { requestId: data.requestId, sessionId: SESSION, route: world.route, viewport: world.viewport, state: world.state, accessToken: VIEWER_JWT, expiresInSeconds: 300 } });
  }
  if (route === "precheck") { world.prechecks++; return world.scenario === "revoked" ? send(res, 403, { ok: false, code: "grant_not_active" }) : send(res, 200, { ok: true }); }
  if (route === "store") {
    if (world.scenario === "store_refused") return send(res, 403, { ok: false, code: "revoked_during_capture" });
    const png = Buffer.from(data.pngBase64, "base64");
    assert.equal(createHash("sha256").update(png).digest("hex"), data.meta.imageSha256);
    assert.equal(data.accessToken, VIEWER_JWT);
    world.stored.push({ meta: data.meta, png });
    return send(res, 200, { ok: true, captureId: "00000000-0000-4000-8000-000000000073" });
  }
  if (route === "fail") { world.failed.push(data.detail); return send(res, 200, { ok: true }); }
  return send(res, 404, {});
});

const env = (extra = {}) => ({
  ...process.env, CANX_ALLOW_LOCAL: "1", CANX_OFFICE_BASE_URL: `http://127.0.0.1:${app.port}`,
  CANX_VIEW_BROKER_URL: `http://127.0.0.1:${broker.port}/functions/v1/office-view`,
  ACTIONS_ID_TOKEN_REQUEST_URL: `http://127.0.0.1:${oidc.port}/token?x=1`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner-request-token", ...extra,
});
const run = (scenario, set = {}, e = env(), id = REQ) => new Promise((resolve) => {
  Object.assign(world, { scenario, stored: [], failed: [], prechecks: 0, reported: [], claims: 0, route: "/brain", viewport: "desktop", state: "default" }, set);
  const child = spawn(process.execPath, ["scripts/capture/run-capture.mjs", "--request-id", id], { env: e });
  let out = "", err = "";
  child.stdout.on("data", (c) => (out += c)); child.stderr.on("data", (c) => (err += c));
  child.on("close", (code) => resolve({ code, out, err }));
});

const results = [];
try {
  // 1. Happy path, desktop.
  let r = await run("ok");
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(world.stored.length, 1);
  let { meta, png } = world.stored[0];
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(meta.route, "/brain"); assert.equal(meta.room, "Goal & Analytics / CanX Brain");
  assert.deepEqual(meta.viewport, { name: "desktop", width: 1440, height: 900 }); assert.equal(meta.state, "default");
  assert.equal(world.prechecks, 1);
  assert.equal(r.out.includes(VIEWER_JWT) || r.err.includes(VIEWER_JWT), false, "viewer token never printed");
  assert.equal(r.out.includes("aaa.bbb.ccc"), false, "workflow token never printed");
  assert.deepEqual(world.reported, ["blocked"], "a request to another website is blocked");
  results.push("desktop capture stored with correct record; checksum matches; tokens not printed; off-site request blocked");

  // 2. Mobile.
  r = await run("ok", { viewport: "mobile" });
  assert.equal(r.code, 0); assert.deepEqual(world.stored[0].meta.viewport, { name: "mobile", width: 390, height: 844 });
  results.push("mobile capture at the matching size");

  // 3. Synopsis open.
  r = await run("ok", { state: "synopsis_open" });
  assert.equal(r.code, 0, r.out + r.err); assert.equal(world.stored[0].meta.state, "synopsis_open");
  results.push("synopsis menu opened before capture");
  r = await run("ok", { state: "synopsis_open", route: "/reception" });
  assert.equal(r.code, 1); assert.deepEqual(world.failed, ["synopsis_not_found"]); assert.equal(world.stored.length, 0);
  results.push("synopsis that cannot be opened is reported, nothing stored");

  // 4. Refusals: nothing is ever stored.
  const refuse = async (scenario, code, exit = 1, set = {}) => {
    const x = await run(scenario, set);
    assert.equal(x.code, exit, `${scenario}: ${x.out}${x.err}`);
    assert.equal(world.stored.length, 0, `${scenario} stored something`);
    if (code) assert.deepEqual(world.failed, [code], scenario);
    return x;
  };
  await refuse("signin", "session_not_accepted");
  await refuse("redirect", "wrong_room");
  await refuse("missing", "page_not_ready");
  await refuse("notready", "page_not_ready");
  await refuse("blank", "page_not_ready");
  await refuse("revoked", "grant_not_active");
  const refused = await run("store_refused");
  assert.equal(refused.code, 1); assert.match(refused.out, /store_refused/);
  const claimNo = await run("claim_refused");
  assert.equal(claimNo.code, 1); assert.match(claimNo.out, /claim_refused/); assert.equal(world.stored.length, 0);
  const noId = await run("oidc_down");
  assert.equal(noId.code, 1); assert.match(noId.out, /oidc_unavailable/); assert.equal(world.claims, 0, "no claim without a workflow identity");
  results.push("sign-in page, wrong route, missing page, unfinished render, blank page, revoked before capture, store refused, claim refused, no workflow identity: all refused with nothing stored");

  // 5. Environment refusals happen before any request.
  for (const bad of [
    { CANX_OFFICE_BASE_URL: "https://evil.example" }, { CANX_OFFICE_BASE_URL: "https://canx-office.lovable.app.evil.example" },
    { CANX_OFFICE_BASE_URL: "https://user:pw@canx-office.lovable.app" }, { CANX_VIEW_BROKER_URL: "https://evil.example/functions/v1/office-view" },
    { CANX_VIEW_BROKER_URL: "https://abcdefghijklmnopqrst.supabase.co/functions/v1/other" }, { CANX_ALLOW_LOCAL: "0" },
    { ACTIONS_ID_TOKEN_REQUEST_URL: "" },
  ]) {
    const x = await run("ok", {}, env(bad));
    assert.equal(x.code, 2, JSON.stringify(bad) + x.out); assert.equal(world.claims, 0);
  }
  const badId = await run("ok", {}, env(), "not-a-uuid");
  assert.equal(badId.code, 2); assert.equal(world.claims, 0);
  results.push("wrong office address, wrong broker, lookalike hosts, embedded credentials, missing identity and bad request id are refused before any request");

  console.log("Capture runner verified in real Chromium against stand-in servers:\n - " + results.join("\n - ") + "\nThis is NOT a live-Office check.");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const s of [app.s, oidc.s, broker.s]) s.close();
}
