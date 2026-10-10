/**
 * Office view broker — the one trusted piece between assistants and the capture runner.
 *
 * PROPOSED, not deployed. Pure and dependency-injected so every rule can be tested
 * without a network. The edge function (docs/proposed/office-view-function.ts) only
 * wires real fetch, storage and GitHub calls into these handlers.
 *
 * Who may call what:
 *  - request / poll / fetch / read: an assistant (Claude or ChatGPT through the approved
 *    connector token, or Elsie on the owner's signed-in session). The assistant's NAME is read
 *    from the database (canx_view_whoami), never from the caller.
 *  - claim / store: ONLY the capture workflow running from the main branch, proven by a GitHub
 *    OIDC token. The workflow holds no stored secret.
 *
 * Rules kept here:
 *  - A viewer session token goes only to the OIDC-proven workflow, or is used inside this
 *    function for one read. It is never returned to an assistant and never logged.
 *  - Stored images are checked (PNG, size, checksum, record) and removed if the grant was
 *    revoked while the capture ran.
 *  - Errors reach callers as short stable codes. Logs hold codes and ids, never tokens or images.
 */

import { validateCaptureMeta, type RoomCaptureMeta } from "@/lib/room-capture";

export type BrokerCode =
  | "no_grant" | "revoked" | "grant_expired" | "wrong_permission" | "unknown_room" | "room_not_granted"
  | "bad_request" | "rate_limited" | "connector_inactive" | "request_already_claimed" | "request_expired"
  | "unknown_request" | "grant_not_active" | "capture_unavailable" | "revoked_during_capture" | "wrong_route"
  | "session_not_bindable" | "unknown_session" | "oidc_invalid" | "image_invalid" | "image_too_large"
  | "checksum_mismatch" | "capture_timeout" | "capture_failed" | "dispatch_failed" | "unavailable" | "not_signed_in";

export class BrokerError extends Error {
  constructor(readonly code: BrokerCode) {
    super(code);
    this.name = "BrokerError";
  }
}

const KNOWN: ReadonlySet<string> = new Set<BrokerCode>([
  "no_grant", "revoked", "grant_expired", "wrong_permission", "unknown_room", "room_not_granted", "bad_request",
  "rate_limited", "connector_inactive", "request_already_claimed", "request_expired", "unknown_request",
  "grant_not_active", "capture_unavailable", "revoked_during_capture", "wrong_route", "session_not_bindable", "unknown_session",
]);

/** The database raises plain reason codes; anything else becomes "unavailable" so no detail leaks. */
export function codeFromDatabaseMessage(message: unknown): BrokerCode {
  const text = typeof message === "string" ? message : "";
  // Longest code first, so "revoked_during_capture" is never mistaken for "revoked".
  for (const code of [...KNOWN].sort((a, b) => b.length - a.length)) if (text.includes(code)) return code as BrokerCode;
  if (/Owner sign-in required/i.test(text)) return "not_signed_in";
  return "unavailable";
}

/** Plain words for each code, safe to show an assistant. */
export const BROKER_MESSAGES: Record<BrokerCode, string> = {
  no_grant: "This assistant has not been given access to view the Office.",
  revoked: "Access for this assistant was turned off by the owner.",
  grant_expired: "This assistant's access has expired. The owner can renew it.",
  wrong_permission: "This assistant's permission does not include that kind of viewing.",
  unknown_room: "That is not an Office room.",
  room_not_granted: "The owner has not given this assistant access to that room.",
  bad_request: "That request was not valid.",
  rate_limited: "Too many room views in the last hour. Try again later.",
  connector_inactive: "The Office connection is not active or approved.",
  request_already_claimed: "That capture was already started.",
  request_expired: "The capture request expired before it started. Ask again.",
  unknown_request: "No such capture request.",
  grant_not_active: "Access was turned off before the capture started.",
  capture_unavailable: "That capture is not available (it may belong to another assistant, have expired, or access was revoked).",
  revoked_during_capture: "Access was turned off while the capture was running. Nothing was kept.",
  wrong_route: "The captured page was not the requested room. Nothing was kept.",
  session_not_bindable: "The viewing session could not be opened.",
  unknown_session: "Unknown viewing session.",
  oidc_invalid: "The capture runner could not be verified.",
  image_invalid: "The captured image was not valid. Nothing was kept.",
  image_too_large: "The captured image was too large. Nothing was kept.",
  checksum_mismatch: "The image did not match its record. Nothing was kept.",
  capture_timeout: "The capture did not finish in time. No picture is available; try again.",
  capture_failed: "The capture failed. No picture is available.",
  dispatch_failed: "The capture runner could not be started. No picture is available.",
  unavailable: "The Office viewing service is unavailable right now. Missing access is not an empty Office.",
  not_signed_in: "A signed-in Office session is required.",
};

/* ------------------------------ GitHub OIDC (runner identity) ------------------------------ */

export interface OidcPolicy {
  audience: string;
  repository: string; // owner/name
  ref: string; // refs/heads/main
  workflowRef: string; // owner/name/.github/workflows/file.yml@refs/heads/main
  issuer?: string;
  skewSeconds?: number;
}

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

interface Jwk { kid?: string; kty?: string; n?: string; e?: string; alg?: string; use?: string }

function b64urlToBytes(value: string): Uint8Array {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function parseJson(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface OidcResult { ok: boolean; claims?: Record<string, unknown>; reason?: string }

/** Verifies signature (RS256 against GitHub's keys) and that the token is from the exact workflow on the exact branch. */
export async function verifyGithubOidc(
  token: string,
  policy: OidcPolicy,
  deps: { jwks: () => Promise<{ keys: Jwk[] }>; now?: () => number },
): Promise<OidcResult> {
  const fail = (reason: string): OidcResult => ({ ok: false, reason });
  if (typeof token !== "string" || token.length > 8192) return fail("shape");
  const parts = token.split(".");
  if (parts.length !== 3) return fail("shape");
  const header = parseJson(b64urlToBytes(parts[0]!));
  const claims = parseJson(b64urlToBytes(parts[1]!));
  if (!header || !claims) return fail("shape");
  if (header["alg"] !== "RS256") return fail("alg");
  const kid = header["kid"];
  if (typeof kid !== "string") return fail("kid");
  let keys: Jwk[];
  try { keys = (await deps.jwks()).keys; } catch { return fail("jwks"); }
  const jwk = keys.find((k) => k.kid === kid && k.kty === "RSA");
  if (!jwk || !jwk.n || !jwk.e) return fail("kid");
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]!) as unknown as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as unknown as BufferSource);
  } catch { return fail("signature"); }
  if (!valid) return fail("signature");

  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const skew = policy.skewSeconds ?? 60;
  const exp = claims["exp"], nbf = claims["nbf"], iat = claims["iat"];
  if (typeof exp !== "number" || exp + skew <= now) return fail("expired");
  if (typeof nbf === "number" && nbf - skew > now) return fail("not-yet");
  if (typeof iat === "number" && iat - skew > now) return fail("not-yet");
  if (typeof iat === "number" && now - iat > 15 * 60) return fail("too-old");
  if (claims["iss"] !== (policy.issuer ?? GITHUB_OIDC_ISSUER)) return fail("issuer");
  const aud = claims["aud"];
  if (!(aud === policy.audience || (Array.isArray(aud) && aud.includes(policy.audience)))) return fail("audience");
  if (claims["repository"] !== policy.repository) return fail("repository");
  if (claims["ref"] !== policy.ref) return fail("ref");
  if (claims["job_workflow_ref"] !== policy.workflowRef) return fail("workflow");
  if (claims["event_name"] !== "workflow_dispatch") return fail("event");
  return { ok: true, claims };
}

/* ------------------------------------- dependencies ------------------------------------- */

export interface BrokerDeps {
  /** Call a database function as the CALLER (their own token). Never the service role. */
  callAs(token: string, fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Call a database function as the service role (server-only functions). */
  callService(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Look up a viewer account's email (service role). */
  viewerEmail(viewerUserId: string): Promise<string | null>;
  /** Open a short session for a viewer account. Returns the access token only. */
  mintViewerToken(email: string): Promise<string>;
  /** End a viewer's auth session. Best effort. */
  endSession(accessToken: string): Promise<void>;
  storage: {
    put(path: string, bytes: Uint8Array): Promise<void>;
    get(path: string): Promise<Uint8Array | null>;
    remove(path: string): Promise<void>;
  };
  /** Start the capture workflow for one request id. */
  dispatch(requestId: string): Promise<void>;
  /** Read a room's saved information as the viewer (their own token, row-level security applies). */
  readRoom(viewerToken: string, route: string): Promise<unknown>;
  now(): number;
  sleep(ms: number): Promise<void>;
  newId(): string;
  log(entry: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PNG_BYTES = 3_000_000;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BrokerError) throw error;
    throw new BrokerError(codeFromDatabaseMessage(error instanceof Error ? error.message : ""));
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
}

/* ------------------------------------ assistant side ------------------------------------ */

export interface Caller { token: string; asElsie: boolean }
export interface ViewSpec { route: string; viewport?: "desktop" | "mobile"; state?: "default" | "synopsis_open" }

async function who(deps: BrokerDeps, caller: Caller) {
  const result = rows(await guarded(() => deps.callAs(caller.token, "canx_view_whoami", { _as_elsie: caller.asElsie })))[0];
  if (!result || typeof result["owner_id"] !== "string" || typeof result["assistant"] !== "string") throw new BrokerError("connector_inactive");
  return { owner: result["owner_id"] as string, assistant: result["assistant"] as string };
}

/** Ask for a fresh picture. Returns the request id after the runner has been started. */
export async function requestCapture(deps: BrokerDeps, caller: Caller, spec: ViewSpec): Promise<{ requestId: string }> {
  const fn = caller.asElsie ? "canx_view_request_create_elsie" : "canx_view_request_create";
  const id = await guarded(() => deps.callAs(caller.token, fn, { _route: spec.route, _viewport: spec.viewport ?? "desktop", _state: spec.state ?? "default", _purpose: "image" }));
  if (typeof id !== "string" || !UUID.test(id)) throw new BrokerError("unavailable");
  try {
    await deps.dispatch(id);
  } catch {
    await deps.callService("canx_view_request_fail", { _request: id, _detail: "dispatch_failed" }).catch(() => undefined);
    deps.log({ event: "dispatch_failed", request: id });
    throw new BrokerError("dispatch_failed");
  }
  deps.log({ event: "capture_requested", request: id, route: spec.route });
  return { requestId: id };
}

export interface RequestStatus { status: "queued" | "claimed" | "stored" | "failed" | "refused"; captureId: string | null; detail: string | null }

export async function requestStatus(deps: BrokerDeps, caller: Caller, requestId: string): Promise<RequestStatus | null> {
  if (!UUID.test(requestId)) throw new BrokerError("bad_request");
  const row = rows(await guarded(() => deps.callAs(caller.token, "canx_view_request_status", { _request: requestId, _as_elsie: caller.asElsie })))[0];
  if (!row) return null;
  return { status: row["status"] as RequestStatus["status"], captureId: (row["capture_id"] as string | null) ?? null, detail: (row["detail"] as string | null) ?? null };
}

/** Wait for the runner. A timeout is reported as a timeout, never as a picture. */
export async function waitForCapture(deps: BrokerDeps, caller: Caller, requestId: string, timeoutMs = 90_000, pollMs = 2_000): Promise<string> {
  const stop = deps.now() + timeoutMs;
  while (deps.now() < stop) {
    const s = await requestStatus(deps, caller, requestId);
    if (!s) throw new BrokerError("unknown_request");
    if (s.status === "stored" && s.captureId) return s.captureId;
    if (s.status === "failed") throw new BrokerError(failureCode(s.detail));
    if (s.status === "refused") throw new BrokerError("grant_not_active");
    await deps.sleep(pollMs);
  }
  throw new BrokerError("capture_timeout");
}

function failureCode(detail: string | null): BrokerCode {
  if (detail === "dispatch_failed") return "dispatch_failed";
  if (detail === "expired_before_claim") return "request_expired";
  return "capture_failed";
}

export interface FetchedCapture { meta: RoomCaptureMeta; png: Uint8Array }

/** Retrieve a stored picture. Only the assistant that asked for it, and only while its access is on. */
export async function fetchCapture(deps: BrokerDeps, caller: Caller, captureId: string): Promise<FetchedCapture> {
  if (!UUID.test(captureId)) throw new BrokerError("bad_request");
  const me = await who(deps, caller);
  const row = rows(await guarded(() => deps.callService("canx_view_capture_fetch", { _owner: me.owner, _assistant: me.assistant, _capture: captureId })))[0];
  if (!row) throw new BrokerError("capture_unavailable");
  const checked = validateCaptureMeta({
    room: row["room"], route: row["route"], capturedAt: row["captured_at"],
    viewport: { name: row["viewport"], width: row["viewport"] === "mobile" ? 390 : 1440, height: row["viewport"] === "mobile" ? 844 : 900 },
    buildVersion: row["build_version"], state: row["ui_state"], pageHeight: row["page_height"], imageSha256: row["image_sha256"],
  });
  if (!checked.ok) throw new BrokerError("capture_unavailable");
  const png = await deps.storage.get(String(row["storage_path"]));
  if (!png) throw new BrokerError("capture_unavailable");
  if ((await sha256Hex(png)) !== checked.meta.imageSha256) throw new BrokerError("checksum_mismatch");
  deps.log({ event: "capture_fetched", capture: captureId, assistant: me.assistant });
  return { meta: checked.meta, png };
}

/* -------------------------------------- runner side -------------------------------------- */

export interface Claimed {
  requestId: string;
  sessionId: string;
  route: string;
  viewport: "desktop" | "mobile";
  state: "default" | "synopsis_open";
  accessToken: string;
  expiresInSeconds: number;
}

function sessionIdOf(accessToken: string): string | null {
  const payload = parseJson(b64urlToBytes(accessToken.split(".")[1] ?? ""));
  const sid = payload?.["session_id"];
  return typeof sid === "string" && UUID.test(sid) ? sid : null;
}

/** Claim, open and bind a viewer session for one request. Used by the runner (after OIDC) and for information reads. */
async function openViewerSession(deps: BrokerDeps, requestId: string) {
  const claimed = rows(await guarded(() => deps.callService("canx_view_request_claim", { _request: requestId })))[0];
  if (!claimed) throw new BrokerError("unknown_request");
  const sessionId = String(claimed["session_id"]);
  try {
    const email = await deps.viewerEmail(String(claimed["viewer_user_id"]));
    if (!email) throw new BrokerError("unavailable");
    const accessToken = await deps.mintViewerToken(email);
    const authSession = sessionIdOf(accessToken);
    if (!authSession) { await deps.endSession(accessToken).catch(() => undefined); throw new BrokerError("unavailable"); }
    await guarded(() => deps.callService("canx_view_session_bind", { _session: sessionId, _auth_session: authSession }));
    return { claimed, sessionId, accessToken };
  } catch (error) {
    await deps.callService("canx_view_request_fail", { _request: requestId, _detail: "session_not_opened" }).catch(() => undefined);
    throw error instanceof BrokerError ? error : new BrokerError("unavailable");
  }
}

export async function claimForRunner(deps: BrokerDeps, oidcToken: string, policy: OidcPolicy, jwks: () => Promise<{ keys: Jwk[] }>, requestId: string): Promise<Claimed> {
  const oidc = await verifyGithubOidc(oidcToken, policy, { jwks, now: deps.now });
  if (!oidc.ok) {
    deps.log({ event: "oidc_refused", reason: oidc.reason });
    throw new BrokerError("oidc_invalid");
  }
  if (!UUID.test(requestId)) throw new BrokerError("bad_request");
  const { claimed, sessionId, accessToken } = await openViewerSession(deps, requestId);
  deps.log({ event: "capture_claimed", request: requestId, run: oidc.claims?.["run_id"] });
  return {
    requestId, sessionId,
    route: String(claimed["route"]), viewport: claimed["viewport"] as Claimed["viewport"], state: claimed["ui_state"] as Claimed["state"],
    accessToken, expiresInSeconds: 300,
  };
}

export interface StoreInput { requestId?: string; sessionId: string; meta: unknown; pngBase64: string; accessToken?: string }

export async function storeFromRunner(deps: BrokerDeps, oidcToken: string, policy: OidcPolicy, jwks: () => Promise<{ keys: Jwk[] }>, input: StoreInput): Promise<{ captureId: string }> {
  const oidc = await verifyGithubOidc(oidcToken, policy, { jwks, now: deps.now });
  if (!oidc.ok) { deps.log({ event: "oidc_refused", reason: oidc.reason }); throw new BrokerError("oidc_invalid"); }
  if (!UUID.test(input.sessionId)) throw new BrokerError("bad_request");
  const finish = async () => { if (input.accessToken) await deps.endSession(input.accessToken).catch(() => undefined); };

  const checked = validateCaptureMeta(input.meta);
  if (!checked.ok) { await finish(); throw new BrokerError("image_invalid"); }
  if (typeof input.pngBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.pngBase64) || input.pngBase64.length > Math.ceil(MAX_PNG_BYTES * 4 / 3) + 8) {
    await finish();
    throw new BrokerError(input.pngBase64?.length > MAX_PNG_BYTES ? "image_too_large" : "image_invalid");
  }
  const bytes = Uint8Array.from(atob(input.pngBase64), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PNG_BYTES) { await finish(); throw new BrokerError("image_too_large"); }
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) { await finish(); throw new BrokerError("image_invalid"); }
  if ((await sha256Hex(bytes)) !== checked.meta.imageSha256) { await finish(); throw new BrokerError("checksum_mismatch"); }

  // The session row names the owner and assistant; derive the storage folder from it, not from the caller.
  const sessionRow = rows(await guarded(() => deps.callService("canx_view_session_owner", { _session: input.sessionId })))[0];
  if (!sessionRow) { await finish(); throw new BrokerError("unknown_session"); }
  const path = `${String(sessionRow["owner_id"])}/${String(sessionRow["assistant"])}/${deps.newId()}.png`;
  await deps.storage.put(path, bytes);
  try {
    const captureId = await guarded(() => deps.callService("canx_view_capture_record", { _session: input.sessionId, _meta: checked.meta, _path: path }));
    await finish();
    if (typeof captureId !== "string") throw new BrokerError("unavailable");
    deps.log({ event: "capture_stored", capture: captureId, route: checked.meta.route });
    return { captureId };
  } catch (error) {
    // Revoked, wrong route or unknown session: nothing may stay in storage.
    await deps.storage.remove(path).catch(() => undefined);
    await finish();
    deps.log({ event: "capture_rejected", code: error instanceof BrokerError ? error.code : "unavailable" });
    throw error instanceof BrokerError ? error : new BrokerError("unavailable");
  }
}

export async function failFromRunner(deps: BrokerDeps, oidcToken: string, policy: OidcPolicy, jwks: () => Promise<{ keys: Jwk[] }>, requestId: string, detail: string, accessToken?: string): Promise<void> {
  const oidc = await verifyGithubOidc(oidcToken, policy, { jwks, now: deps.now });
  if (!oidc.ok) throw new BrokerError("oidc_invalid");
  if (!UUID.test(requestId)) throw new BrokerError("bad_request");
  const safe = /^[a-z_]{1,40}$/.test(detail) ? detail : "capture_failed";
  await deps.callService("canx_view_request_fail", { _request: requestId, _detail: safe });
  if (accessToken) await deps.endSession(accessToken).catch(() => undefined);
}

/* ------------------------------------ information reads ------------------------------------ */

/** Read a room's saved information as the assistant's own viewer identity, under row-level security. */
export async function readRoomInformation(deps: BrokerDeps, caller: Caller, route: string): Promise<unknown> {
  const fn = caller.asElsie ? "canx_view_request_create_elsie" : "canx_view_request_create";
  const id = await guarded(() => deps.callAs(caller.token, fn, { _route: route, _viewport: "desktop", _state: "default", _purpose: "information" }));
  if (typeof id !== "string" || !UUID.test(id)) throw new BrokerError("unavailable");
  const { sessionId, accessToken } = await openViewerSession(deps, id);
  try {
    const value = await deps.readRoom(accessToken, route);
    deps.log({ event: "information_read", request: id, route });
    return value;
  } finally {
    await deps.endSession(accessToken).catch(() => undefined);
    await deps.callService("canx_view_session_close", { _session: sessionId }).catch(() => undefined);
  }
}

/* --------------------------------------- safe logging --------------------------------------- */

const SECRET_KEYS = /token|secret|password|authorization|key|png|image|base64|jwt|cookie/i;

/** Drops anything that could carry a credential or a picture before it reaches a log. */
export function redactForLog(entry: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (SECRET_KEYS.test(k)) { out[k] = "[withheld]"; continue; }
    if (typeof v === "string") out[k] = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(v) || v.length > 300 ? "[withheld]" : v;
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else out[k] = "[withheld]";
  }
  return out;
}
