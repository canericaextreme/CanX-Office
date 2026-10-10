// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BROKER_MESSAGES,
  BrokerError,
  GITHUB_OIDC_ISSUER,
  claimForRunner,
  codeFromDatabaseMessage,
  failFromRunner,
  precheckForRunner,
  fetchCapture,
  readRoomInformation,
  redactForLog,
  requestCapture,
  requestStatus,
  sha256Hex,
  storeFromRunner,
  verifyGithubOidc,
  waitForCapture,
  type BrokerDeps,
  type OidcPolicy,
} from "@/lib/office-view-broker";

const REPO = "canericaextreme/CanX-Office";
const WORKFLOW = `${REPO}/.github/workflows/office-view-capture.yml@refs/heads/main`;
const POLICY: OidcPolicy = { audience: "canx-office-view", repository: REPO, ref: "refs/heads/main", workflowRef: WORKFLOW };
const NOW = Date.UTC(2026, 9, 10, 18, 0, 0);
const U = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const OWNER = U(1), VIEWER = U(11), REQ = U(70), SESSION = U(71), AUTH_SESSION = U(72), CAPTURE = U(73);

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function signer() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as { n: string; e: string };
  const keys = [{ kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e }];
  const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) => {
    const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${b64url(sig)}`;
  };
  return { keys, sign, jwks: async () => ({ keys }) };
}

const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: GITHUB_OIDC_ISSUER, aud: "canx-office-view", repository: REPO, ref: "refs/heads/main", job_workflow_ref: WORKFLOW,
  event_name: "workflow_dispatch", run_id: "123", iat: NOW / 1000 - 5, nbf: NOW / 1000 - 5, exp: NOW / 1000 + 300, ...over,
});

describe("runner identity (GitHub OIDC)", () => {
  it("accepts only the exact workflow on main, dispatched, with the right audience", async () => {
    const s = await signer();
    expect((await verifyGithubOidc(await s.sign(goodClaims()), POLICY, { jwks: s.jwks, now: () => NOW })).ok).toBe(true);
    const refuse = async (over: Record<string, unknown>, reason: string) => {
      const r = await verifyGithubOidc(await s.sign(goodClaims(over)), POLICY, { jwks: s.jwks, now: () => NOW });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(reason);
    };
    await refuse({ aud: "someone-else" }, "audience");
    await refuse({ repository: "attacker/CanX-Office" }, "repository");
    await refuse({ ref: "refs/heads/feature" }, "ref");
    await refuse({ ref: "refs/pull/81/merge" }, "ref");
    await refuse({ job_workflow_ref: `${REPO}/.github/workflows/other.yml@refs/heads/main` }, "workflow");
    await refuse({ job_workflow_ref: `${REPO}/.github/workflows/office-view-capture.yml@refs/heads/feature` }, "workflow");
    await refuse({ event_name: "push" }, "event");
    await refuse({ event_name: "pull_request" }, "event");
    await refuse({ iss: "https://evil.example" }, "issuer");
    await refuse({ exp: NOW / 1000 - 600 }, "expired");
    await refuse({ iat: NOW / 1000 + 3600, nbf: NOW / 1000 + 3600, exp: NOW / 1000 + 7200 }, "not-yet");
    await refuse({ iat: NOW / 1000 - 3600, nbf: NOW / 1000 - 3600 }, "too-old");
  });

  it("refuses forged, re-signed, unsigned or malformed tokens", async () => {
    const real = await signer();
    const forger = await signer();
    const forged = await forger.sign(goodClaims());
    expect((await verifyGithubOidc(forged, POLICY, { jwks: real.jwks, now: () => NOW })).reason).toBe("signature");
    const parts = (await real.sign(goodClaims())).split(".");
    const tampered = `${parts[0]}.${b64url(JSON.stringify(goodClaims({ ref: "refs/heads/main", repository: "x/y" })))}.${parts[2]}`;
    expect((await verifyGithubOidc(tampered, POLICY, { jwks: real.jwks, now: () => NOW })).ok).toBe(false);
    const none = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(goodClaims()))}.`;
    expect((await verifyGithubOidc(none, POLICY, { jwks: real.jwks, now: () => NOW })).reason).toBe("alg");
    const hs = await real.sign(goodClaims(), { alg: "HS256", kid: "k1" });
    expect((await verifyGithubOidc(hs, POLICY, { jwks: real.jwks, now: () => NOW })).reason).toBe("alg");
    expect((await verifyGithubOidc(await real.sign(goodClaims(), { alg: "RS256", kid: "unknown" }), POLICY, { jwks: real.jwks, now: () => NOW })).reason).toBe("kid");
    for (const bad of ["", "a.b", "a.b.c.d", "x".repeat(9000)]) expect((await verifyGithubOidc(bad, POLICY, { jwks: real.jwks, now: () => NOW })).ok).toBe(false);
    expect((await verifyGithubOidc(await real.sign(goodClaims()), POLICY, { jwks: async () => { throw new Error("down"); }, now: () => NOW })).reason).toBe("jwks");
  });
});

/* ------------------------------- a fake world for the handlers ------------------------------- */

const PNG = (() => {
  const body = new Uint8Array(64);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  body.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 20);
  return body;
})();
const toB64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };

interface World {
  deps: BrokerDeps;
  calls: Array<{ as: string; fn: string; args: Record<string, unknown> }>;
  stored: Map<string, Uint8Array>;
  logs: Record<string, unknown>[];
  ended: string[];
  dispatched: string[];
  state: { revoked: boolean; status: string; captureId: string | null; detail: string | null; assistant: string; sessionToken: string; readViaToken: string[]; dispatchFails: boolean; bindFails: boolean; clock: number };
}

const viewerJwt = () => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ session_id: AUTH_SESSION, sub: VIEWER }))}.sig`;

function world(over: Partial<World["state"]> = {}): World {
  const state = { revoked: false, status: "queued", captureId: null as string | null, detail: null as string | null, assistant: "claude", sessionToken: viewerJwt(), readViaToken: [] as string[], dispatchFails: false, bindFails: false, clock: NOW, ...over };
  const calls: World["calls"] = [];
  const stored = new Map<string, Uint8Array>();
  const logs: Record<string, unknown>[] = [];
  const ended: string[] = [];
  const dispatched: string[] = [];
  const deps: BrokerDeps = {
    async callAs(token, fn, args) {
      calls.push({ as: `user:${token}`, fn, args });
      if (token === "bad-token") throw new Error("connector_inactive");
      if (fn === "canx_view_whoami") return [{ owner_id: OWNER, assistant: args["_as_elsie"] ? "elsie" : state.assistant }];
      if (fn.startsWith("canx_view_request_create")) {
        if (state.revoked) throw new Error("revoked");
        if (args["_route"] === "/finance") throw new Error("room_not_granted");
        return REQ;
      }
      if (fn === "canx_view_request_status") return [{ status: state.status, capture_id: state.captureId, detail: state.detail, route: "/brain" }];
      throw new Error("unexpected");
    },
    async callService(fn, args) {
      calls.push({ as: "service", fn, args });
      if (fn === "canx_view_request_claim") {
        if (state.status !== "queued") throw new Error("request_already_claimed");
        state.status = "claimed";
        return [{ session_id: SESSION, owner_id: OWNER, assistant: state.assistant, route: "/brain", purpose: "image", viewport: "desktop", ui_state: "default", viewer_user_id: VIEWER }];
      }
      if (fn === "canx_view_session_bind") { if (state.bindFails) throw new Error("session_not_bindable"); return null; }
      if (fn === "canx_view_session_owner") return [{ owner_id: OWNER, assistant: state.assistant, route: "/brain" }];
      if (fn === "canx_view_capture_record") {
        if (state.revoked) throw new Error("revoked_during_capture");
        state.captureId = CAPTURE; state.status = "stored";
        return CAPTURE;
      }
      if (fn === "canx_view_capture_fetch") {
        if (state.revoked) throw new Error("revoked");
        if (args["_assistant"] !== state.assistant) throw new Error("capture_unavailable");
        return [{ storage_path: [...stored.keys()][0], route: "/brain", room: "Goal & Analytics / CanX Brain", viewport: "desktop", ui_state: "default", build_version: "index-x.js", page_height: 900, image_sha256: capturedHash, captured_at: new Date(NOW).toISOString() }];
      }
      if (fn === "canx_view_request_fail") { state.status = "failed"; state.detail = String(args["_detail"]); return null; }
      if (fn === "canx_view_session_close") return null;
      if (fn === "canx_view_session_active") return !state.revoked;
      throw new Error("unexpected");
    },
    async viewerEmail() { return "viewer-claude@example.invalid"; },
    async mintViewerToken() { return state.sessionToken; },
    async endSession(t) { ended.push(t); },
    storage: {
      async put(path, bytes) { stored.set(path, bytes); },
      async get(path) { return stored.get(path) ?? null; },
      async remove(path) { stored.delete(path); },
    },
    async dispatch(id) { if (state.dispatchFails) throw new Error("github down"); dispatched.push(id); },
    async readRoom(token, route) { state.readViaToken.push(token); return { route, titles: ["Legal topic"] }; },
    now: () => state.clock,
    sleep: async (ms) => { state.clock += ms; },
    newId: () => U(80),
    log: (e) => logs.push(e),
  };
  return { deps, calls, stored, logs, ended, dispatched, state };
}

let capturedHash = "";
const meta = async (over: Record<string, unknown> = {}) => {
  capturedHash = await sha256Hex(PNG);
  return { room: "Goal & Analytics / CanX Brain", route: "/brain", capturedAt: new Date(NOW).toISOString(), viewport: { name: "desktop", width: 1440, height: 900 }, buildVersion: "index-x.js", state: "default", pageHeight: 900, imageSha256: capturedHash, ...over };
};

const caller = { token: "assistant-token", asElsie: false };
const errorCode = async (p: Promise<unknown>) => { try { await p; return "no error"; } catch (e) { return e instanceof BrokerError ? e.code : `other:${String(e)}`; } };

describe("asking for a picture", () => {
  it("creates the request as the assistant's own token and starts the runner", async () => {
    const w = world();
    expect(await requestCapture(w.deps, caller, { route: "/brain" })).toEqual({ requestId: REQ });
    expect(w.dispatched).toEqual([REQ]);
    const create = w.calls.find((c) => c.fn === "canx_view_request_create")!;
    expect(create.as).toBe("user:assistant-token");
    expect(Object.keys(create.args)).toEqual(["_route", "_viewport", "_state", "_purpose"]); // no assistant name is ever passed
  });

  it("uses the Elsie entry only when the caller is Elsie", async () => {
    const w = world();
    await requestCapture(w.deps, { token: "owner-token", asElsie: true }, { route: "/brain", viewport: "mobile", state: "synopsis_open" });
    expect(w.calls[0]!.fn).toBe("canx_view_request_create_elsie");
    expect(w.calls[0]!.args).toMatchObject({ _viewport: "mobile", _state: "synopsis_open" });
  });

  it("maps refusals to stable codes and never dispatches", async () => {
    const w = world();
    expect(await errorCode(requestCapture(w.deps, caller, { route: "/finance" }))).toBe("room_not_granted");
    expect(await errorCode(requestCapture(w.deps, { token: "bad-token", asElsie: false }, { route: "/brain" }))).toBe("connector_inactive");
    w.state.revoked = true;
    expect(await errorCode(requestCapture(w.deps, caller, { route: "/brain" }))).toBe("revoked");
    expect(w.dispatched).toEqual([]);
  });

  it("marks the request failed when the runner cannot be started", async () => {
    const w = world({ dispatchFails: true });
    expect(await errorCode(requestCapture(w.deps, caller, { route: "/brain" }))).toBe("dispatch_failed");
    expect(w.state.status).toBe("failed");
    expect(w.state.detail).toBe("dispatch_failed");
  });

  it("reports a timeout as a timeout, and a failed run as a failure", async () => {
    const w = world();
    expect(await errorCode(waitForCapture(w.deps, caller, REQ, 10_000, 2_000))).toBe("capture_timeout");
    w.state.status = "failed"; w.state.detail = "page_not_ready";
    expect(await errorCode(waitForCapture(w.deps, caller, REQ, 10_000, 2_000))).toBe("capture_failed");
    w.state.status = "stored"; w.state.captureId = CAPTURE;
    expect(await waitForCapture(w.deps, caller, REQ)).toBe(CAPTURE);
    expect(await errorCode(requestStatus(w.deps, caller, "not-a-uuid"))).toBe("bad_request");
  });
});

describe("the runner", () => {
  it("is refused without a valid workflow identity, before touching the database", async () => {
    const w = world();
    const s = await signer();
    const bad = await s.sign(goodClaims({ ref: "refs/heads/evil" }));
    expect(await errorCode(claimForRunner(w.deps, bad, POLICY, s.jwks, REQ))).toBe("oidc_invalid");
    expect(await errorCode(storeFromRunner(w.deps, bad, POLICY, s.jwks, { sessionId: SESSION, meta: await meta(), pngBase64: toB64(PNG) }))).toBe("oidc_invalid");
    expect(await errorCode(failFromRunner(w.deps, bad, POLICY, s.jwks, REQ, "x"))).toBe("oidc_invalid");
    expect(w.calls.filter((c) => c.as === "service")).toEqual([]);
    expect(w.logs.some((l) => l["event"] === "oidc_refused")).toBe(true);
  });

  it("claims once, opens a bound session and returns the token only to the runner", async () => {
    const w = world();
    const s = await signer();
    const token = await s.sign(goodClaims());
    const claimed = await claimForRunner(w.deps, token, POLICY, s.jwks, REQ);
    expect(claimed).toMatchObject({ requestId: REQ, sessionId: SESSION, route: "/brain", viewport: "desktop", state: "default", expiresInSeconds: 300 });
    expect(claimed.accessToken).toBe(w.state.sessionToken);
    expect(w.calls.find((c) => c.fn === "canx_view_session_bind")!.args).toEqual({ _session: SESSION, _auth_session: AUTH_SESSION });
    expect(await errorCode(claimForRunner(w.deps, token, POLICY, s.jwks, REQ))).toBe("request_already_claimed"); // replay
    expect(JSON.stringify(w.logs)).not.toContain(claimed.accessToken);
  });

  it("fails the request and ends the session when the session cannot be bound", async () => {
    const w = world({ bindFails: true });
    const s = await signer();
    expect(await errorCode(claimForRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, REQ))).toBe("session_not_bindable");
    expect(w.state.status).toBe("failed");
  });

  it("refuses a viewer token with no session id", async () => {
    const w = world({ sessionToken: `${b64url("{}")}.${b64url("{}")}.sig` });
    const s = await signer();
    expect(await errorCode(claimForRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, REQ))).toBe("unavailable");
    expect(w.ended.length).toBe(1);
  });
});

describe("checking just before capture", () => {
  it("passes while access is on and refuses once it is revoked or the runner is not proven", async () => {
    const w = world();
    const s = await signer();
    const ok = await s.sign(goodClaims());
    await precheckForRunner(w.deps, ok, POLICY, s.jwks, SESSION);
    w.state.revoked = true;
    expect(await errorCode(precheckForRunner(w.deps, ok, POLICY, s.jwks, SESSION))).toBe("grant_not_active");
    expect(await errorCode(precheckForRunner(w.deps, await s.sign(goodClaims({ ref: "refs/heads/x" })), POLICY, s.jwks, SESSION))).toBe("oidc_invalid");
    expect(await errorCode(precheckForRunner(w.deps, ok, POLICY, s.jwks, "nope"))).toBe("bad_request");
  });
});

describe("storing a picture", () => {
  const run = async (w: World, input: Partial<Parameters<typeof storeFromRunner>[4]> = {}) => {
    const s = await signer();
    return storeFromRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, { sessionId: SESSION, meta: await meta(), pngBase64: toB64(PNG), accessToken: "viewer-token", ...input });
  };

  it("stores a valid picture under a path built from the database, then ends the viewer session", async () => {
    const w = world();
    expect(await run(w)).toEqual({ captureId: CAPTURE });
    expect([...w.stored.keys()]).toEqual([`${OWNER}/claude/${U(80)}.png`]);
    expect(w.ended).toEqual(["viewer-token"]);
  });

  it("keeps nothing when the grant was revoked while the capture ran", async () => {
    const w = world({ revoked: true });
    expect(await errorCode(run(w))).toBe("revoked_during_capture");
    expect(w.stored.size).toBe(0);
    expect(w.ended).toEqual(["viewer-token"]);
    expect(w.logs.some((l) => l["event"] === "capture_rejected")).toBe(true);
  });

  it("refuses bad records, bad images, wrong checksums and oversize images before storing", async () => {
    const w = world();
    expect(await errorCode(run(w, { meta: await meta({ route: "/nope" }) }))).toBe("image_invalid");
    expect(await errorCode(run(w, { meta: await meta({ room: "Legal" }) }))).toBe("image_invalid");
    expect(await errorCode(run(w, { pngBase64: toB64(new Uint8Array(64)) }))).toBe("image_invalid"); // not a PNG
    expect(await errorCode(run(w, { pngBase64: "not base64!!" }))).toBe("image_invalid");
    expect(await errorCode(run(w, { meta: await meta({ imageSha256: "b".repeat(64) }) }))).toBe("checksum_mismatch");
    const big = new Uint8Array(3_100_000); big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(await errorCode(run(w, { pngBase64: toB64(big), meta: await meta({ imageSha256: await sha256Hex(big) }) }))).toBe("image_too_large");
    expect(await errorCode(run(w, { sessionId: "nope" }))).toBe("bad_request");
    expect(w.stored.size).toBe(0);
  });

  it("records a failure with a safe detail only", async () => {
    const w = world();
    const s = await signer();
    await failFromRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, REQ, "page_not_ready", "viewer-token");
    expect(w.state.detail).toBe("page_not_ready");
    await failFromRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, REQ, "Secret: eyJhbGciOi.payload.sig");
    expect(w.state.detail).toBe("capture_failed");
  });
});

describe("retrieving a picture", () => {
  const stage = async (w: World) => {
    const s = await signer();
    await storeFromRunner(w.deps, await s.sign(goodClaims()), POLICY, s.jwks, { sessionId: SESSION, meta: await meta(), pngBase64: toB64(PNG) });
  };

  it("returns the picture and its record to the assistant that asked", async () => {
    const w = world(); await stage(w);
    const got = await fetchCapture(w.deps, caller, CAPTURE);
    expect(got.png).toEqual(PNG);
    expect(got.meta).toMatchObject({ route: "/brain", room: "Goal & Analytics / CanX Brain", imageSha256: capturedHash });
  });

  it("refuses another assistant, a revoked grant, a bad id and a corrupted file", async () => {
    const w = world(); await stage(w);
    w.state.assistant = "chatgpt";
    // the stored row belongs to claude, but the fake database compares the asking assistant
    const w2 = world(); await stage(w2); w2.state.assistant = "claude";
    const other = world(); other.stored = w2.stored; // not used: different world, same shape
    expect(await errorCode(fetchCapture(world().deps, caller, "nope"))).toBe("bad_request");
    w2.state.revoked = true;
    expect(await errorCode(fetchCapture(w2.deps, caller, CAPTURE))).toBe("revoked");
    const w3 = world(); await stage(w3);
    for (const k of w3.stored.keys()) w3.stored.set(k, new Uint8Array(PNG.length));
    expect(await errorCode(fetchCapture(w3.deps, caller, CAPTURE))).toBe("checksum_mismatch");
    const w4 = world(); await stage(w4);
    w4.stored.clear();
    expect(await errorCode(fetchCapture(w4.deps, caller, CAPTURE))).toBe("capture_unavailable");
  });

  it("asks the database as the right assistant (the name comes from the database)", async () => {
    const w = world(); await stage(w);
    await fetchCapture(w.deps, caller, CAPTURE);
    const fetchCall = w.calls.filter((c) => c.fn === "canx_view_capture_fetch").pop()!;
    expect(fetchCall.args).toEqual({ _owner: OWNER, _assistant: "claude", _capture: CAPTURE });
  });
});

describe("reading room information", () => {
  it("reads as the viewer under row-level security and always ends the session", async () => {
    const w = world();
    const value = (await readRoomInformation(w.deps, caller, "/legal")) as { titles: string[] };
    expect(value.titles).toEqual(["Legal topic"]);
    expect(w.state.readViaToken).toEqual([w.state.sessionToken]);
    expect(w.ended).toEqual([w.state.sessionToken]);
    expect(w.calls.find((c) => c.fn === "canx_view_request_create")!.args["_purpose"]).toBe("information");
    expect(w.calls.some((c) => c.fn === "canx_view_session_close")).toBe(true);
  });

  it("ends the session even when the read fails, and refuses ungranted rooms", async () => {
    const w = world();
    w.deps.readRoom = async () => { throw new Error("boom"); };
    await expect(readRoomInformation(w.deps, caller, "/legal")).rejects.toThrow();
    expect(w.ended.length).toBe(1);
    expect(await errorCode(readRoomInformation(world().deps, caller, "/finance"))).toBe("room_not_granted");
  });
});

describe("messages, codes and logs", () => {
  it("turns database messages into stable codes without leaking detail", () => {
    expect(codeFromDatabaseMessage('error: revoked_during_capture at line 3')).toBe("revoked_during_capture");
    expect(codeFromDatabaseMessage("room_not_granted")).toBe("room_not_granted");
    expect(codeFromDatabaseMessage("relation canx_private.secret does not exist")).toBe("unavailable");
    expect(codeFromDatabaseMessage(undefined)).toBe("unavailable");
    expect(codeFromDatabaseMessage("Owner sign-in required")).toBe("not_signed_in");
  });

  it("has plain wording for every code and none that mentions credentials", () => {
    for (const text of Object.values(BROKER_MESSAGES)) {
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/token|password|secret|key/i);
    }
  });

  it("withholds tokens, keys, images and long text from logs", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.signaturesignature";
    const out = redactForLog({ event: "x", accessToken: jwt, note: jwt, pngBase64: "AAAA", apiKey: "k", long: "x".repeat(400), nested: { a: 1 }, n: 3, ok: true, route: "/brain" });
    expect(out).toEqual({ event: "x", accessToken: "[withheld]", note: "[withheld]", pngBase64: "[withheld]", apiKey: "[withheld]", long: "[withheld]", nested: "[withheld]", n: 3, ok: true, route: "/brain" });
    expect(JSON.stringify(out)).not.toContain("eyJ");
  });
});
