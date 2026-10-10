#!/usr/bin/env node
/**
 * Real-browser capture of ONE CanX Office room. Phase 1 proof tool.
 *
 * What it does: opens the room in a real Chromium, hides form fields and
 * no-capture areas, takes a full-page PNG (not an HTML redraw) and writes a
 * JSON sidecar (room, route, time, viewport, build version, state, checksum).
 *
 * What it deliberately does NOT do:
 * - It never signs in. Signed-in rooms need a storage-state file supplied by an
 *   owner-approved mechanism that does not exist yet (see
 *   docs/room-capture-design.md). Without one, the room's sign-in screen is
 *   what gets captured — which is itself the "signed-out is refused" proof.
 * - It accepts no passwords or tokens on the command line.
 * - It captures only rooms on the allowlist, and withholds Finance,
 *   Subscriptions, Communications and Records.
 * - It uploads nothing and calls no Office service.
 *
 * Usage:
 *   node scripts/capture/capture-room.mjs --base-url https://host --route /brain \
 *     --viewport desktop|mobile [--state default|synopsis_open] \
 *     [--hover-selector "css"] [--storage-state file.json] [--out dir] [--build-version v]
 *
 * Needs the `playwright` package (install with --no-save; the repo's
 * dependencies are not changed) and a Chromium.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

/* Keep these three blocks identical to src/lib/room-capture.ts; the tests check. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
export const WITHHELD_ROUTES = ["/finance", "/subscriptions", "/communications", "/records"];
export const MASK_CSS =
  "input,textarea,select,[contenteditable],[data-canx-no-capture]{visibility:hidden !important}";

export const ROOM_LABELS = {
  "/reception": "Reception / Office Manager",
  "/owner-desk": "Owner's Desk",
  "/brain": "Goal & Analytics / CanX Brain",
  "/idea-garage": "Idea Garage / Income & Decision Room",
  "/projects": "Project Rooms",
  "/safe-highways": "Safe Highways Room",
  "/work-board": "Work Board",
  "/office-team": "Office Team",
  "/build-testing": "Build & Testing",
  "/finance": "Finance Office",
  "/subscriptions": "Subscription Watch",
  "/communications": "Communications & Marketing",
  "/legal": "Legal & Compliance",
  "/records": "Records & Rules",
  "/skills": "Skills / SOP Library",
  "/systems": "Systems & Connections",
  "/health": "Office Health / Backup & Recovery",
  "/approvals": "Approvals",
  "/blueprint": "Office Blueprint",
  "/future": "Future Department",
};

export const ALLOWED_ROUTES = Object.keys(ROOM_LABELS);

function fail(message, code = 2) {
  console.error(`capture refused: ${message}`);
  process.exit(code);
}

export function checkTarget(baseUrl, route) {
  let url;
  try { url = new URL(baseUrl); } catch { return "base URL is not a valid URL"; }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "base URL must be https (or localhost)";
  if (url.username || url.password || url.search || url.hash) return "base URL must not contain credentials, query or fragment";
  if (!ALLOWED_ROUTES.includes(route)) return "route is not an Office room";
  if (WITHHELD_ROUTES.includes(route)) return "this room is withheld from capture until the owner approves it";
  return null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      route: { type: "string" },
      viewport: { type: "string", default: "desktop" },
      state: { type: "string", default: "default" },
      "hover-selector": { type: "string" },
      "storage-state": { type: "string" },
      out: { type: "string", default: "capture-output" },
      "build-version": { type: "string" },
    },
  });
  const baseUrl = values["base-url"] ?? "";
  const route = values.route ?? "";
  const problem = checkTarget(baseUrl, route);
  if (problem) fail(problem);
  const viewportName = values.viewport;
  if (!(viewportName in VIEWPORTS)) fail("viewport must be desktop or mobile");
  const state = values.state;
  if (state !== "default" && state !== "synopsis_open") fail("state must be default or synopsis_open");
  if (state === "synopsis_open" && !values["hover-selector"]) fail("synopsis_open needs --hover-selector for the button");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORTS[viewportName],
      deviceScaleFactor: 1,
      ...(values["storage-state"] ? { storageState: values["storage-state"] } : {}),
    });
    const page = await context.newPage();
    await page.goto(new URL(route, baseUrl).toString(), { waitUntil: "networkidle", timeout: 45_000 });
    await page.addStyleTag({ content: MASK_CSS });
    if (state === "synopsis_open") {
      await page.hover(values["hover-selector"], { timeout: 10_000 });
      await page.waitForTimeout(300);
    }
    const image = await page.screenshot({ fullPage: true, type: "png" });
    const meta = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      const entry = scripts.map((s) => s.getAttribute("src") ?? "").find((s) => /\/assets\/.+\.js$/.test(s));
      return { build: entry ? entry.split("/").pop() : "unknown", height: document.documentElement.scrollHeight };
    });
    const sidecar = {
      room: ROOM_LABELS[route],
      route,
      capturedAt: new Date().toISOString(),
      viewport: { name: viewportName, ...VIEWPORTS[viewportName] },
      buildVersion: values["build-version"] ?? meta.build,
      state,
      pageHeight: meta.height,
      imageSha256: createHash("sha256").update(image).digest("hex"),
    };
    await mkdir(values.out, { recursive: true, mode: 0o700 });
    const stem = `${route.slice(1)}-${viewportName}-${state}`;
    await writeFile(path.join(values.out, `${stem}.png`), image, { mode: 0o600 });
    await writeFile(path.join(values.out, `${stem}.json`), JSON.stringify(sidecar, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ wrote: stem, ...sidecar }));
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => fail(error instanceof Error ? error.message : "unexpected failure", 1));
}
