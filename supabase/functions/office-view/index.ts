// edge function `office-view` (approved by John 10 Oct 2026). Install guide: docs/proposed/office-view/INSTALL.md
// broker (src/lib/office-view-broker.ts). Every rule lives in the broker, not here.
import { endViewerSession } from "../../../src/lib/office-view-auth.ts";
import {
  BROKER_MESSAGES, BrokerError, claimForRunner, failFromRunner, fetchCapture, precheckForRunner, readRoomInformation, redactForLog,
  requestCapture, storeFromRunner, waitForCapture, requestStatus, verifyGithubOidc,
  type BrokerDeps, type OidcPolicy,
} from "../../../src/lib/office-view-broker.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const URL_ = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY"), SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const REPO = env("CANX_VIEW_REPO") || "canericaextreme/CanX-Office";
const WORKFLOW_FILE = "office-view-capture.yml";
const POLICY: OidcPolicy = {
  audience: "canx-office-view", repository: REPO, ref: "refs/heads/main",
  workflowRef: `${REPO}/.github/workflows/${WORKFLOW_FILE}@refs/heads/main`,
};
const CLEANUP_POLICY: OidcPolicy = {
  ...POLICY,
  workflowRef: `${REPO}/.github/workflows/office-view-cleanup.yml@refs/heads/main`,
  events: ["schedule", "workflow_dispatch"],
};
const BUCKET = "office-captures";
const T = { signal: () => AbortSignal.timeout(15_000) };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const rest = async (path: string, init: RequestInit & { key: string; bearer: string }) => {
  const { key, bearer, ...rest } = init;
  return fetch(`${URL_}${path}`, { ...rest, headers: { apikey: key, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...(rest.headers ?? {}) }, redirect: "error", signal: T.signal() });
};
const rpc = async (fn: string, args: Record<string, unknown>, key: string, bearer: string) => {
  const r = await rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args), key, bearer });
  const text = await r.text();
  if (!r.ok) throw new Error(((() => { try { return JSON.parse(text).message; } catch { return text; } })() as string) ?? "failed");
  return text ? JSON.parse(text) : null;
};

let jwksCache: { at: number; keys: { keys: never[] } } | null = null;
const jwks = async () => {
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const r = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks", { signal: T.signal() });
  if (!r.ok) throw new Error("jwks");
  const keys = await r.json();
  jwksCache = { at: Date.now(), keys };
  return keys;
};

const deps: BrokerDeps = {
  callAs: (token, fn, args) => rpc(fn, args, ANON, token),
  callService: (fn, args) => rpc(fn, args, SERVICE, SERVICE),
  async viewerEmail(id) {
    const r = await rest(`/auth/v1/admin/users/${id}`, { method: "GET", key: SERVICE, bearer: SERVICE });
    return r.ok ? ((await r.json()).email ?? null) : null;
  },
  async mintViewerToken(email) {
    // Magic-link mint + immediate verify: yields a normal short session for the viewer account only.
    const g = await rest(`/auth/v1/admin/generate_link`, { method: "POST", body: JSON.stringify({ type: "magiclink", email }), key: SERVICE, bearer: SERVICE });
    if (!g.ok) throw new Error("mint");
    const hashed = (await g.json()).hashed_token;
    const v = await rest(`/auth/v1/verify`, { method: "POST", body: JSON.stringify({ type: "magiclink", token_hash: hashed }), key: ANON, bearer: ANON });
    if (!v.ok) throw new Error("mint");
    const token = (await v.json()).access_token;
    if (typeof token !== "string") throw new Error("mint");
    return token;
  },
  endSession: (token) => endViewerSession(token, (path, bearer) => rest(path, { method: "POST", key: ANON, bearer })),
  storage: {
    async put(path, bytes) {
      const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "image/png", "x-upsert": "false" }, body: bytes as unknown as BodyInit, redirect: "error", signal: T.signal() });
      if (!r.ok) throw new Error("storage");
    },
    async get(path) {
      const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, redirect: "error", signal: T.signal() });
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    },
    async remove(path) {
      const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, signal: T.signal() });
      if (!r.ok && r.status !== 404) throw new Error("storage_delete_failed");
    },
  },
  async dispatch(requestId) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: "POST", redirect: "error", signal: T.signal(),
      headers: { Authorization: `Bearer ${env("CANX_VIEW_DISPATCH_TOKEN")}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { request_id: requestId } }),
    });
    if (r.status !== 204) throw new Error("dispatch");
  },
  // Runs as the viewer (security invoker): row-level security decides, and the function narrows to the requested room.
  readRoom: (viewerToken, route) => rpc("canx_view_room_information", { _route: route }, ANON, viewerToken),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  newId: () => crypto.randomUUID(),
  log: (entry) => console.log(JSON.stringify(redactForLog(entry))),
};

/** Expired/revoked captures are unreadable immediately. The authenticated hourly workflow deletes bytes.
 * Failed deletes remain pending and make the workflow fail visibly, so the next run can retry. */
async function purgeExpired() {
  const rows = await deps.callService("canx_view_capture_purge", {});
  let failed = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    const path = (row as { storage_path?: unknown }).storage_path;
    if (typeof path !== "string") { failed = true; continue; }
    try {
      await deps.storage.remove(path);
      await deps.callService("canx_view_capture_deleted", { _path: path });
    } catch { failed = true; deps.log({ event: "capture_cleanup_retry" }); }
  }
  if (failed) throw new BrokerError("unavailable");
}

const bearer = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
const HTTP: Record<string, number> = { oidc_invalid: 401, not_signed_in: 401, bad_request: 400, unavailable: 503, viewer_busy: 503, capture_timeout: 504, image_too_large: 413 };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, code: "bad_request" });
  const route = new URL(req.url).pathname.replace(/^\/(functions\/v1\/)?office-view\/?/, "");
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine for some routes */ }
  const token = bearer(req);
  if (!token) return json(401, { ok: false, code: "not_signed_in", message: BROKER_MESSAGES.not_signed_in });
  const caller = { token, asElsie: body["asElsie"] === true };
  try {
    if (route === "cleanup") {
      const proof = await verifyGithubOidc(token, CLEANUP_POLICY, { jwks, now: deps.now });
      if (!proof.ok) throw new BrokerError("oidc_invalid");
      await purgeExpired();
      return json(200, { ok: true });
    }
    switch (route) {
      // Runner (proven by the workflow's own GitHub identity token; no stored secret).
      case "claim": return json(200, { ok: true, claimed: await claimForRunner(deps, token, POLICY, jwks, String(body["requestId"] ?? "")) });
      case "precheck": await precheckForRunner(deps, token, POLICY, jwks, String(body["sessionId"] ?? "")); return json(200, { ok: true });
      case "store": return json(200, { ok: true, ...(await storeFromRunner(deps, token, POLICY, jwks, body as never)) });
      case "fail": await failFromRunner(deps, token, POLICY, jwks, String(body["requestId"] ?? ""), String(body["detail"] ?? ""), body["accessToken"] as string | undefined); return json(200, { ok: true });
      // Assistant (identity read from the database, never from the request).
      case "request": {
        const { requestId } = await requestCapture(deps, caller, { route: String(body["route"] ?? ""), viewport: body["viewport"] as never, state: body["state"] as never });
        return json(200, { ok: true, requestId });
      }
      case "status": return json(200, { ok: true, status: await requestStatus(deps, caller, String(body["requestId"] ?? "")) });
      case "wait": return json(200, { ok: true, captureId: await waitForCapture(deps, caller, String(body["requestId"] ?? "")) });
      case "fetch": {
        const c = await fetchCapture(deps, caller, String(body["captureId"] ?? ""));
        let bin = ""; for (let i = 0; i < c.png.length; i += 0x8000) bin += String.fromCharCode(...c.png.subarray(i, i + 0x8000));
        return json(200, { ok: true, meta: c.meta, pngBase64: btoa(bin) });
      }
      case "read": return json(200, { ok: true, information: await readRoomInformation(deps, caller, String(body["route"] ?? "")) });
      default: return json(404, { ok: false, code: "bad_request" });
    }
  } catch (error) {
    const code = error instanceof BrokerError ? error.code : "unavailable";
    deps.log({ event: "refused", route, code });
    return json(HTTP[code] ?? 403, { ok: false, code, message: BROKER_MESSAGES[code as keyof typeof BROKER_MESSAGES] ?? BROKER_MESSAGES.unavailable });
  }
});
