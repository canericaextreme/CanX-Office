// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyAccessWith, type BackendConfig } from "@/lib/canx-backend.server";
import { VIEWER_READ_SITES, verifyOwnerOrViewerReadWith, verifyViewerWith } from "@/lib/canx-viewer.server";

const config: BackendConfig = { url: "https://db.example.invalid", publishableKey: "pk" };
const OWNER = "00000000-0000-4000-8000-000000000001";
const VIEWER = "00000000-0000-4000-8000-000000000011";
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: "HS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 600, ...claims })}.sig`;
const ownerToken = (aal = "aal2") => jwt({ sub: OWNER, aal });
const viewerToken = (extra: Record<string, unknown> = {}) => jwt({ sub: VIEWER, aal: "aal1", session_id: "s", ...extra });

interface Net { viewerSelf?: unknown; viewerSelfStatus?: number; userStatus?: number; ownerRole?: boolean; calls: string[] }
function fakeFetch(net: Net): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = String((init?.headers as Record<string, string>)?.["Authorization"] ?? "");
    net.calls.push(url.replace(config.url, ""));
    const sub = (() => { try { return JSON.parse(atob(auth.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).sub; } catch { return null; } })();
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/auth/v1/user")) return net.userStatus && net.userStatus !== 200 ? json({}, net.userStatus) : json({ id: sub });
    if (url.endsWith("/rpc/has_role")) return json(sub === OWNER && net.ownerRole !== false);
    if (url.endsWith("/rpc/canx_view_self")) return json(net.viewerSelf ?? [], net.viewerSelfStatus ?? 200);
    return json({}, 404);
  }) as typeof fetch;
}
const SELF = [{ owner_id: OWNER, assistant: "claude", rooms: ["/brain", "/legal"], scopes: ["read_room_information"] }];

describe("owner path is unchanged", () => {
  it("accepts an owner with the authenticator exactly as before, without asking about viewers", async () => {
    const net: Net = { calls: [] };
    const r = await verifyOwnerOrViewerReadWith(config, ownerToken("aal2"), true, fakeFetch(net));
    expect(r).toMatchObject({ ok: true, userId: OWNER, aal: "aal2" });
    expect(net.calls.some((c) => c.includes("canx_view_self"))).toBe(false);
  });

  it("does not turn an owner without the authenticator into a viewer", async () => {
    const net: Net = { calls: [], viewerSelf: [] };
    const r = await verifyOwnerOrViewerReadWith(config, ownerToken("aal1"), true, fakeFetch(net));
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ reason: "mfa_required" }); // the ORIGINAL refusal, not a viewer one
  });
});

describe("viewer path", () => {
  it("accepts a confirmed viewer session and reports the owner it reads for", async () => {
    const net: Net = { calls: [], viewerSelf: SELF };
    const r = await verifyOwnerOrViewerReadWith(config, viewerToken(), true, fakeFetch(net));
    expect(r).toEqual({ ok: true, userId: OWNER, email: "", aal: "viewer", viewer: { assistant: "claude", rooms: ["/brain", "/legal"] } });
    const loose = await verifyOwnerOrViewerReadWith(config, viewerToken(), false, fakeFetch({ calls: [], viewerSelf: SELF }));
    expect(loose.ok).toBe(true);
  });

  it("refuses a viewer whose session is not open (database returns nothing)", async () => {
    for (const viewerSelf of [[], undefined, [{ owner_id: 5 }], [{ owner_id: OWNER }], "no"]) {
      const r = await verifyOwnerOrViewerReadWith(config, viewerToken(), true, fakeFetch({ calls: [], viewerSelf }));
      expect(r.ok).toBe(false);
    }
    expect((await verifyOwnerOrViewerReadWith(config, viewerToken(), true, fakeFetch({ calls: [], viewerSelf: SELF, viewerSelfStatus: 403 }))).ok).toBe(false);
    expect((await verifyOwnerOrViewerReadWith(config, viewerToken(), true, fakeFetch({ calls: [], viewerSelf: SELF, userStatus: 401 }))).ok).toBe(false);
  });

  it("refuses connector tokens, expired tokens, malformed tokens and a missing configuration", async () => {
    const net = (): Net => ({ calls: [], viewerSelf: SELF });
    expect((await verifyViewerWith(config, viewerToken({ client_id: "c" }), fakeFetch(net()))).ok).toBe(false);
    expect((await verifyViewerWith(config, viewerToken({ exp: 1 }), fakeFetch(net()))).ok).toBe(false);
    expect((await verifyViewerWith(config, "nope", fakeFetch(net()))).ok).toBe(false);
    expect((await verifyViewerWith(config, "", fakeFetch(net()))).ok).toBe(false);
    expect((await verifyViewerWith(null, viewerToken(), fakeFetch(net()))).ok).toBe(false);
    expect((await verifyViewerWith(config, viewerToken(), (async () => { throw new Error("down"); }) as unknown as typeof fetch)).ok).toBe(false);
  });

  it("the ordinary owner check never accepts a viewer", async () => {
    const net: Net = { calls: [], viewerSelf: SELF, ownerRole: false };
    for (const requireAal2 of [true, false]) {
      expect((await verifyAccessWith(config, viewerToken(), requireAal2, fakeFetch(net))).ok).toBe(false);
    }
    expect(net.calls.some((c) => c.includes("canx_view_self"))).toBe(false);
  });
});

/* ------------------------- only read-only call sites accept a viewer ------------------------- */

describe("the page keeps action gates owner-only", () => {
  it("never lets a viewer count as having completed the authenticator step-up", () => {
    const provider = readFileSync("src/lib/owner-session.tsx", "utf8");
    expect(provider).toContain('stepUpComplete: state === "owner" && aal === "aal2",');
    expect(provider).toContain('canReadProtected: state === "owner" && (aal === "aal2" || viewer)');
  });

  it("uses the read-only flag only where data is read, never for an action", () => {
    const users = ["src/components/office/RoomReports.tsx", "src/components/office/ProjectRegister.tsx"];
    for (const f of users) expect(readFileSync(f, "utf8")).toContain("canReadProtected");
    for (const f of readdirSync("src/components/office").map((n) => `src/components/office/${n}`).filter((n) => n.endsWith(".tsx") && !n.endsWith(".test.tsx"))) {
      if (users.includes(f)) continue;
      expect(readFileSync(f, "utf8"), f).not.toContain("canReadProtected");
    }
    // The assistants, builds, consent and spending panels still need the real authenticator.
    for (const f of ["OfficeManager", "ClaudeBuildPanel", "CodexBuildPanel", "ClaudeSpendApproval"]) {
      expect(readFileSync(`src/components/office/${f}.tsx`, "utf8")).toContain("session.stepUpComplete");
    }
    expect(readFileSync("src/routes/_office/oauth/consent.tsx", "utf8")).toContain("session.stepUpComplete");
  });

  it("starts no assistant, alert or companion in a viewing session", () => {
    const layout = readFileSync("src/routes/_office.tsx", "utf8");
    expect(layout).toMatch(/readOnlyViewer \? \(/);
    const viewerBranch = layout.slice(layout.indexOf("readOnlyViewer ? ("), layout.indexOf(") : ("));
    expect(viewerBranch).not.toMatch(/OfficeManager|CompanionDock|ApprovalAlert/);
  });
});

describe("the viewer allowlist", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  // Writes, spending and outside sends. (A handler may test whether a key is configured; it may not use one.)
  const WRITE_HINTS = /method:\s*["'](POST|PATCH|PUT|DELETE)["']\s*,\s*(body|headers)|resolution=merge-duplicates|reserve_?[aA]i_?[cC]all|sendMail|gmail\.send|api\.openai|api\.anthropic|api\.github|\.insert\(|\.upsert\(|\.update\(|\.delete\(/;

  it("lists exactly the files that import the viewer verifier", () => {
    const users = readdirSync("src/lib")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx") && f !== "canx-viewer.server.ts")
      .map((f) => `src/lib/${f}`)
      .filter((p) => src(p).includes("canx-viewer.server"));
    const sessionCheck = "src/lib/auth.functions.ts"; // tells the page a session is a read-only viewer; reads nothing
    expect(users).toContain(sessionCheck);
    expect([...users.filter((p) => p !== sessionCheck)].sort()).toEqual([...VIEWER_READ_SITES].sort().filter((p) => users.includes(p)));
    // Every listed site really uses it (no stale entries).
    for (const site of VIEWER_READ_SITES) {
      expect(src(site), site).toContain("canx-viewer.server");
    }
  });

  it("never lets a viewer reach a write or spend path through the viewer verifier", () => {
    // In each file, the lines that call the viewer verifier belong to a handler that must not write.
    for (const site of ["src/lib/brain-index.functions.ts", "src/lib/room-snapshot.functions.ts"]) {
      const text = src(site);
      const handlers = text.split(/export const /).slice(1);
      for (const h of handlers) {
        if (!h.includes("canx-viewer.server")) continue;
        expect(WRITE_HINTS.test(h), `${site}: ${h.slice(0, 40)}`).toBe(false);
      }
    }
  });

  it("uses the viewer verifier only in the named read functions", () => {
    const expectOnly = (file: string, names: string[]) => {
      const handlers = src(file).split(/export const /).slice(1);
      const using = handlers.filter((h) => h.includes("canx-viewer.server")).map((h) => h.split(" ")[0]);
      expect(using.sort(), file).toEqual([...names].sort());
    };
    expectOnly("src/lib/brain-index.functions.ts", ["getBrainIndex"]);
    expectOnly("src/lib/room-snapshot.functions.ts", ["getRoomSnapshot", "checkRoomReportPresence"]);
    expectOnly("src/lib/project-register.functions.ts", ["getProjectRegister"]);
    // The Stage 1 Office status function stays owner-only; its own test pins that.
    expect(src("src/lib/office-status.functions.ts")).not.toContain("canx-viewer.server");
    const subs = src("src/lib/subscriptions.functions.ts");
    expect(subs.match(/ownerRead\(/g)?.length).toBe(2); // the definition and one call (listSubscriptions)
    expect(subs.slice(subs.indexOf("export const listSubscriptions"), subs.indexOf("export const listSubscriptions") + 400)).toContain("ownerRead(");
    for (const file of ["src/lib/records.functions.ts", "src/lib/finance.functions.ts"]) {
      const text = src(file);
      const calls = [...text.matchAll(/withOwnerRead<[^>]+>\(/g)].length;
      expect(calls, file).toBe(file.includes("records") ? 3 : 2); // the definition plus the read calls
      // the write handlers in those files still use the owner-only helper
      expect(text).toMatch(/withOwner</);
    }
    const files = src("src/lib/office-files.functions.ts");
    expect(files.match(/client\([^)]*,true\)/g)?.length).toBe(1);
    const legal = src("src/lib/legal-room.server.ts");
    expect(legal.match(/verifyOwnerOrViewerRead/g)?.length).toBe(1);
    expect(legal.match(/b\.verifyOwner\(/g)?.length).toBe(1); // the save path is still owner-only
  });
});
