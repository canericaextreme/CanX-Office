#!/usr/bin/env node
/**
 * Capture runner for the CanX Office view service. PROPOSED, not deployed.
 *
 * Runs only inside the capture workflow (docs/proposed/office-view-capture.yml). It holds NO stored
 * secret. It proves who it is with the workflow's own short-lived GitHub identity token, asks the
 * broker for the one request it was started for, and receives a 5 minute READ-ONLY viewing session
 * for that request. It opens the real Office in Chromium as that viewer, checks it is really the
 * requested room, takes the picture, and hands it back to the broker. Nothing is written to disk,
 * to the workflow log, or to a workflow artifact.
 *
 * It never signs in as the owner, never handles a password or authenticator code, and refuses any
 * address other than the Office and the broker.
 */

import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { ALLOWED_ROUTES, MASK_CSS, ROOM_LABELS, VIEWPORTS, classifyCapture } from "./capture-room.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OFFICE_HOST = "canx-office.lovable.app";
export const OIDC_AUDIENCE = "canx-office-view";
/** The storage key the Office's own Supabase client reads (see src/lib/canx-supabase.ts). */
export const SESSION_STORAGE_KEY = "canx-office-auth";

/** Text that means the room has not finished loading or could not load. Seen on a page, the picture is not kept. */
export const NOT_READY_PHRASES = [
  "Opening CanX Office",
  "Checking your sign-in",
  "could not be loaded",
  "could not be read",
  "could not be checked",
  "Try again",
];

export const FAIL_CODES = ["bad_environment", "oidc_unavailable", "claim_refused", "session_not_accepted", "page_not_ready", "wrong_room",
  "grant_not_active", "synopsis_not_found", "image_too_large", "store_refused", "capture_failed"];

/** Where the runner may talk. Everything else is refused before any request is made. */
export function checkEnvironment(env) {
  const allowLocal = env.CANX_ALLOW_LOCAL === "1";
  const base = new URL(env.CANX_OFFICE_BASE_URL ?? `https://${OFFICE_HOST}`);
  const broker = new URL(env.CANX_VIEW_BROKER_URL ?? "https://invalid.invalid");
  const local = (u) => allowLocal && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (!(base.protocol === "https:" && base.hostname === OFFICE_HOST) && !local(base)) return "office address is not the CanX Office";
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") return "office address must be a bare origin";
  if (!(broker.protocol === "https:" && /^[a-z0-9]{20}\.supabase\.co$/.test(broker.hostname) && broker.pathname === "/functions/v1/office-view") && !local(broker)) return "broker address is not the Office view service";
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) return "no workflow identity is available";
  return null;
}

function jwtClaims(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"));
  } catch { return {}; }
}

/** The session the Office's own browser client expects to find already stored. No refresh token is supplied. */
export function sessionForStorage(accessToken) {
  const claims = jwtClaims(accessToken);
  const exp = typeof claims.exp === "number" ? claims.exp : Math.floor(Date.now() / 1000) + 300;
  return {
    access_token: accessToken,
    refresh_token: "viewer-session-has-no-refresh",
    token_type: "bearer",
    expires_at: exp,
    expires_in: Math.max(1, exp - Math.floor(Date.now() / 1000)),
    user: { id: claims.sub ?? "viewer", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() },
  };
}

export function pageProblem(text) {
  const hit = NOT_READY_PHRASES.find((p) => text.includes(p));
  return hit ? `page shows "${hit}"` : null;
}

async function post(brokerUrl, route, oidc, body) {
  const response = await fetch(`${brokerUrl}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${oidc}` },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function workflowIdentity(env) {
  const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", OIDC_AUDIENCE);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("oidc_unavailable");
  const { value } = await response.json();
  if (typeof value !== "string" || value.split(".").length !== 3) throw new Error("oidc_unavailable");
  return value;
}

const mask = (value) => { if (process.env.GITHUB_ACTIONS === "true" && value) console.log(`::add-mask::${value}`); };
const say = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

export async function runCapture({ requestId, env = process.env }) {
  const problem = checkEnvironment(env);
  if (problem) { say("refused", { why: problem }); return 2; }
  if (!UUID.test(requestId ?? "")) { say("refused", { why: "request id is not valid" }); return 2; }
  const brokerUrl = new URL(env.CANX_VIEW_BROKER_URL).toString().replace(/\/$/, "");
  const baseUrl = new URL(env.CANX_OFFICE_BASE_URL ?? `https://${OFFICE_HOST}`).toString();

  let oidc;
  try { oidc = await workflowIdentity(env); } catch { say("failed", { code: "oidc_unavailable" }); return 1; }
  mask(oidc);

  let claimed = null;
  const finish = async (code) => {
    // Best effort: tell the broker, which closes the request and ends the viewer session.
    try { await post(brokerUrl, "fail", oidc, { requestId, detail: code, accessToken: claimed?.accessToken }); } catch { /* the request will expire on its own */ }
    say("failed", { code, request: requestId });
    return 1;
  };

  const claim = await post(brokerUrl, "claim", oidc, { requestId }).catch(() => null);
  if (!claim || claim.status !== 200 || !claim.json?.claimed?.accessToken) { say("failed", { code: "claim_refused", http: claim?.status ?? 0, why: claim?.json?.code }); return 1; }
  claimed = claim.json.claimed;
  mask(claimed.accessToken);
  const { route, viewport, state, sessionId } = claimed;
  if (!ALLOWED_ROUTES.includes(route) || !(viewport in VIEWPORTS) || !["default", "synopsis_open"].includes(state)) return finish("wrong_room");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: 1, serviceWorkers: "block" });
    await context.addInitScript(([key, value]) => { try { window.localStorage.setItem(key, value); } catch { /* the page will show it is not signed in */ } },
      [SESSION_STORAGE_KEY, JSON.stringify(sessionForStorage(claimed.accessToken))]);
    // Only the Office itself and its own database may be reached from this page.
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      const own = u.origin === new URL(baseUrl).origin || u.protocol === "data:" || u.protocol === "blob:" || /\.supabase\.co$/.test(u.hostname) || /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname) || (env.CANX_ALLOW_LOCAL === "1" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
      return own ? r.continue() : r.abort();
    });
    const page = await context.newPage();
    const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    // The Office marks a recognised read-only viewing session. A sign-in page or an owner page never has this.
    const badge = await page.waitForSelector("[data-canx-viewer-badge]", { timeout: 20_000, state: "attached" }).catch(() => null);
    await page.waitForTimeout(1500);
    const signals = await page.evaluate(() => {
      const entry = Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute("src") ?? "").find((s) => /\/assets\/.+\.js$/.test(s));
      const root = document.querySelector("[data-canx-office-view]");
      return {
        build: entry ? entry.split("/").pop() : "unknown",
        height: document.documentElement.scrollHeight,
        finalPath: location.pathname.replace(/\/+$/, "") || "/",
        hasOfficeView: Boolean(root),
        hasSignIn: Boolean(document.querySelector('[aria-label="CanX Office entrance"]')),
        textLength: (root?.textContent ?? "").trim().length,
        text: (root?.textContent ?? "").slice(0, 200_000),
      };
    });
    const outcome = classifyCapture({ route, finalPath: signals.finalPath, httpStatus: response ? response.status() : NaN, hasOfficeView: signals.hasOfficeView, hasSignIn: signals.hasSignIn, textLength: signals.textLength });
    if (outcome === "sign_in_page") return finish("session_not_accepted");
    if (outcome !== "ok") return finish(outcome === "wrong_route" ? "wrong_room" : "page_not_ready");
    if (!badge) return finish("session_not_accepted");
    if (pageProblem(signals.text)) return finish("page_not_ready");

    await page.addStyleTag({ content: MASK_CSS });
    if (state === "synopsis_open") {
      const trigger = page.getByRole("button", { name: "Room synopsis" });
      const opened = await trigger.click({ timeout: 10_000 }).then(() => true).catch(() => false);
      const label = ROOM_LABELS[route];
      const item = opened ? page.getByRole("menuitem", { name: new RegExp(label.split(/[,/]/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") }).first() : null;
      const chosen = item ? await item.click({ timeout: 10_000 }).then(() => true).catch(() => false) : false;
      const dialog = chosen ? await page.waitForSelector('[role="dialog"]', { timeout: 10_000 }).catch(() => null) : null;
      if (!dialog) return finish("synopsis_not_found");
      await page.waitForTimeout(300);
    }

    // Immediately before the picture: is this viewing session still allowed?
    const check = await post(brokerUrl, "precheck", oidc, { sessionId }).catch(() => null);
    if (!check || check.status !== 200) return finish("grant_not_active");

    const image = await page.screenshot({ fullPage: true, type: "png" });
    const meta = {
      room: ROOM_LABELS[route], route, capturedAt: new Date().toISOString(),
      viewport: { name: viewport, ...VIEWPORTS[viewport] }, buildVersion: signals.build, state,
      pageHeight: Math.min(Math.max(1, signals.height), 20000),
      imageSha256: createHash("sha256").update(image).digest("hex"),
    };
    if (image.length > 3_000_000) return finish("image_too_large");
    const stored = await post(brokerUrl, "store", oidc, { requestId, sessionId, meta, pngBase64: image.toString("base64"), accessToken: claimed.accessToken }).catch(() => null);
    if (!stored || stored.status !== 200 || !stored.json?.captureId) { say("failed", { code: "store_refused", why: stored?.json?.code ?? "no reply" }); return 1; }
    say("stored", { request: requestId, capture: stored.json.captureId, route, viewport, state });
    return 0;
  } catch {
    return finish("capture_failed");
  } finally {
    claimed = { ...claimed, accessToken: undefined };
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { "request-id": { type: "string" } } });
  runCapture({ requestId: values["request-id"] }).then((code) => process.exit(code), () => { say("failed", { code: "capture_failed" }); process.exit(1); });
}
