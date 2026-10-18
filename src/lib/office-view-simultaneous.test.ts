// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BROKER_MESSAGES, BrokerError, MINT_ATTEMPTS, readRoomInformation, type BrokerDeps } from "@/lib/office-view-broker";
import { CAPTURE_ROOM_LABELS } from "@/lib/room-capture-meta";

/**
 * Room reading when several reads start together (found live 18 Oct 2026: 3 together = 1 read + 2 "unavailable";
 * the same rooms read one at a time all worked). The sign-in service keeps ONE one-time key per viewer account, so a
 * newer key request replaces an older one. The fake below behaves the same way, so the old code fails these tests.
 * Fixtures only: this proves the logic, not the live service.
 */
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = uuid(1), VIEWER = uuid(2);
const jwt = (sid: string) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ session_id: sid }))}.sig`;
const caller = { token: "assistant-token", asElsie: false };

interface Opts {
  singleSlot?: boolean;              // the real service: a new key replaces the previous one
  mintFailures?: number;             // fail this many mint attempts first (another copy of the function minting)
  alwaysFailMint?: boolean;
  createError?: (route: string) => string | null; // database refusal at request time
  readError?: (route: string) => Error | null;    // failure while reading as the viewer
  emptyRooms?: string[];
}

function fake(o: Opts = {}) {
  let n = 100;
  const log: string[] = [];
  const ended: string[] = [];
  const failed: string[] = [];
  const requests = new Map<string, string>(); // request id -> route
  const reads: string[] = [];
  let slot: string | null = null;
  let minted = 0, failuresLeft = o.mintFailures ?? 0, active = 0, maxActive = 0;
  const deps: BrokerDeps = {
    async callAs(_t, fn, args) {
      if (fn === "canx_view_whoami") return [{ owner_id: OWNER, assistant: "claude" }];
      const route = String(args["_route"]);
      const refusal = o.createError?.(route);
      if (refusal) throw new Error(refusal);
      const id = uuid(++n);
      requests.set(id, route);
      return id;
    },
    async callService(fn, args) {
      if (fn === "canx_view_request_claim") return [{ session_id: uuid(++n), viewer_user_id: VIEWER, route: requests.get(String(args["_request"])) }];
      if (fn === "canx_view_request_fail") { failed.push(String(args["_detail"])); return null; }
      return null; // bind / close
    },
    async viewerEmail() { return "viewer@example.invalid"; },
    async mintViewerToken() {
      active++; maxActive = Math.max(maxActive, active);
      try {
        if (o.alwaysFailMint) throw new Error("mint");
        if (failuresLeft > 0) { failuresLeft--; throw new Error("mint"); }
        const mine = `key-${++minted}`;
        slot = mine;                                  // generate_link
        await new Promise((r) => setTimeout(r, 5));    // the network gap before /verify
        if (o.singleSlot && slot !== mine) throw new Error("otp_expired"); // verify finds a replaced key
        return jwt(uuid(1000 + minted));
      } finally { active--; }
    },
    async endSession(t) { ended.push(t); },
    storage: { async put() {}, async get() { return null; }, async remove() {} },
    async dispatch() {},
    async readRoom(_t, route) {
      const err = o.readError?.(route);
      if (err) throw err;
      reads.push(route);
      return { route, titles: o.emptyRooms?.includes(route) ? [] : [`Saved item for ${route}`] };
    },
    now: () => Date.now(),
    sleep: async () => {},
    newId: () => uuid(++n),
    log: (e) => log.push(String(e["event"])),
  };
  return { deps, log, ended, failed, reads, stats: () => ({ minted, maxActive }) };
}

const code = async (p: Promise<unknown>) => { try { await p; return "no error"; } catch (e) { return e instanceof BrokerError ? e.code : `other:${String(e)}`; } };
const ROUTES = Object.keys(CAPTURE_ROOM_LABELS);

describe("simultaneous reads for one assistant", () => {
  it("three reads together all succeed, taking turns instead of replacing each other's key", async () => {
    const f = fake({ singleSlot: true });
    const out = await Promise.all(["/future", "/skills", "/round-table"].map((r) => readRoomInformation(f.deps, caller, r) as Promise<{ route: string }>));
    expect(out.map((v) => v.route)).toEqual(["/future", "/skills", "/round-table"]);
    expect(f.stats().maxActive).toBe(1);   // never two key requests in flight for the same account
    expect(f.ended.length).toBe(3);        // every session still ends
  });

  it("the old behaviour really did fail: without taking turns, the same fake loses reads", async () => {
    const f = fake({ singleSlot: true });
    const raw = ["/a", "/b", "/c"].map((r) => f.deps.mintViewerToken("viewer@example.invalid").then(() => "ok", () => "lost"));
    expect((await Promise.all(raw)).filter((x) => x === "lost").length).toBeGreaterThan(0);
  });

  it("one at a time still works exactly as before", async () => {
    const f = fake({ singleSlot: true });
    for (const r of ["/future", "/skills", "/round-table"]) expect(((await readRoomInformation(f.deps, caller, r)) as { route: string }).route).toBe(r);
  });

  it("retries when another copy of the function wins the key, then succeeds", async () => {
    const f = fake({ mintFailures: MINT_ATTEMPTS - 1 });
    expect(((await readRoomInformation(f.deps, caller, "/legal")) as { route: string }).route).toBe("/legal");
    expect(f.log.filter((e) => e === "viewer_mint_retry").length).toBe(MINT_ATTEMPTS - 1);
  });

  it("when it never gets a key it says viewer_busy - not success, not empty - and reads nothing", async () => {
    const f = fake({ alwaysFailMint: true });
    expect(await code(readRoomInformation(f.deps, caller, "/legal"))).toBe("viewer_busy");
    expect(f.reads).toEqual([]);
    expect(f.failed).toEqual(["session_not_opened"]);
    expect(BROKER_MESSAGES.viewer_busy).toMatch(/Nothing was read/);
    expect(BROKER_MESSAGES.viewer_busy).not.toMatch(/token|password|secret|key/i);
  });

  it("one stuck read does not block the next ones forever", async () => {
    const f = fake({ alwaysFailMint: true });
    const results = await Promise.allSettled([1, 2, 3].map((i) => readRoomInformation(f.deps, caller, `/r${i}`)));
    expect(results.every((r) => r.status === "rejected" && r.reason instanceof BrokerError && r.reason.code === "viewer_busy")).toBe(true); // all loud
    expect(f.stats().maxActive).toBe(1);                              // still one at a time
    expect(f.failed.length).toBe(3);                                  // every request closed as failed, none left hanging
  });
});

describe("failures stay distinct and loud", () => {
  const cases: [string, string][] = [
    ["rate_limited", "rate_limited"], ["room_not_granted", "room_not_granted"], ["revoked", "revoked"],
    ["connector_inactive", "connector_inactive"], ["no_grant", "no_grant"], ["grant_expired", "grant_expired"],
  ];
  it.each(cases)("a %s refusal reaches the caller as %s and never reads or mints", async (db, expected) => {
    const f = fake({ createError: () => db });
    expect(await code(readRoomInformation(f.deps, caller, "/legal"))).toBe(expected);
    expect(f.stats().minted).toBe(0);
    expect(f.reads).toEqual([]);
  });

  it("an exhausted hourly limit mid-batch fails only the reads past the limit, each loudly", async () => {
    let made = 0;
    const f = fake({ createError: () => (++made > 30 ? "rate_limited" : null) });
    const results = await Promise.allSettled(ROUTES.concat(ROUTES).slice(0, 34).map((r) => readRoomInformation(f.deps, caller, r)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(30);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.length).toBe(4);
    expect(rejected.every((r) => r.reason instanceof BrokerError && r.reason.code === "rate_limited")).toBe(true);
  });

  it("a read timeout is an error (unavailable), the session still ends, and no value is returned", async () => {
    const f = fake({ readError: () => Object.assign(new Error("timed out"), { name: "TimeoutError" }) });
    expect(await code(readRoomInformation(f.deps, caller, "/legal"))).not.toBe("no error");
    expect(f.ended.length).toBe(1);
  });

  it("a genuinely empty room is returned as empty data, while a failed read is never empty", async () => {
    const f = fake({ emptyRooms: ["/legal"], readError: (r) => (r === "/health" ? new Error("boom") : null) });
    expect(((await readRoomInformation(f.deps, caller, "/legal")) as { titles: string[] }).titles).toEqual([]);
    await expect(readRoomInformation(f.deps, caller, "/health")).rejects.toBeDefined();
  });
});

describe("whole-office coverage (fixtures, not live)", () => {
  it("the broker's room list is the canonical 24, matching the room briefs and the database list", () => {
    expect(ROUTES.length).toBe(24);
    const briefs = (JSON.parse(readFileSync("docs/office-room-briefs.json", "utf8")).briefs as { route: string }[]).map((b) => b.route).sort();
    expect([...ROUTES].sort()).toEqual(briefs);
    const sql = readFileSync("supabase/migrations/20261011012433_office_view_delegation.sql", "utf8");
    for (const r of ROUTES) expect(sql).toContain(`'${r}'`);
  });

  it("all 24 rooms read together: every room answers, none lost, partial failures are named per room", async () => {
    const f = fake({ singleSlot: true, readError: (r) => (r === "/finance" || r === "/legal" ? new Error("boom") : null) });
    const results = await Promise.allSettled(ROUTES.map((r) => readRoomInformation(f.deps, caller, r)));
    const ok = ROUTES.filter((_, i) => results[i]!.status === "fulfilled");
    const bad = ROUTES.filter((_, i) => results[i]!.status === "rejected");
    expect(bad.sort()).toEqual(["/finance", "/legal"]);
    expect(ok.length).toBe(22);
    expect(f.stats().maxActive).toBe(1);
    expect(f.ended.length).toBe(24);
  });
});
