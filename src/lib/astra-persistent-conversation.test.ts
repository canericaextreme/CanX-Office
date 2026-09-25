import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ASTRA_CACHE_PREFIX, MAX_CACHED_MESSAGES, cacheKey, clearAllSnapshots, clearOtherOwners, emptySnapshot,
  enqueueTurn, flushPending, loadSnapshot, markSynced, mergeMessages, modelThread, saveSnapshot, turnMessages,
  withMessages, type KeyStore, type PendingTurn,
} from "./astra-device-continuity";
import { appendCheckpointWith, loadCheckpointWith, type CheckpointDeps } from "./astra-checkpoint.functions";
import type { Rest } from "./astra-continuity";

const A = "11111111-2222-3333-4444-555555555555";
const B = "99999999-2222-3333-4444-555555555555";
const T1 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const T2 = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";

function memStore(): KeyStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}
const msg = (id: string, role: "user" | "assistant", content: string, at = "2026-09-25T00:00:00.000Z") => ({ id, role, content, at, mode: "text" as const });

describe("device buffer: reload restores text, voice and the unsent draft", () => {
  it("restores visible turns and the draft after a reload for the same owner", () => {
    const store = memStore();
    const snap = withMessages(emptySnapshot(A), [msg("x-u", "user", "Plan Monday"), msg("x-a", "assistant", "Agenda drafted")], "half-typed prompt");
    expect(saveSnapshot(store, snap)).toBe(true);
    const back = loadSnapshot(store, A);
    expect(back.snapshot?.messages.map(m => m.content)).toEqual(["Plan Monday", "Agenda drafted"]);
    expect(back.snapshot?.draft).toBe("half-typed prompt");
    expect(back.message).toContain("Restored 2");
  });

  it("never opens another owner's copy and discards damaged or stale data", () => {
    const store = memStore();
    saveSnapshot(store, withMessages(emptySnapshot(A), [msg("x-u", "user", "secret")], ""));
    expect(loadSnapshot(store, B).snapshot).toBeNull();
    store.setItem(cacheKey(B), "{not json");
    expect(loadSnapshot(store, B).message).toContain("discarded");
    const old = { ...emptySnapshot(A, new Date("2026-01-01")), messages: [msg("o-u", "user", "old")] };
    store.setItem(cacheKey(A), JSON.stringify(old));
    expect(loadSnapshot(store, A, new Date("2026-09-25")).snapshot).toBeNull();
  });

  it("stores no credentials and bounds length", () => {
    const many = Array.from({ length: 200 }, (_, i) => msg(`m${i}`, "user", "x".repeat(9000)));
    const snap = withMessages(emptySnapshot(A), many, "");
    expect(snap.messages).toHaveLength(MAX_CACHED_MESSAGES);
    expect(snap.messages.every(m => m.content.length <= 4000)).toBe(true);
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/accessToken|access_token|Bearer|password/i);
  });

  it("reports failed device storage honestly instead of claiming a copy", () => {
    const broken: KeyStore = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => undefined };
    expect(saveSnapshot(broken, emptySnapshot(A))).toBe(false);
    expect(loadSnapshot(broken, A).message).toContain("could not be read");
    expect(loadSnapshot(null, A).message).toContain("storage unavailable");
  });

  it("clears every owner copy on sign-out and other owners on switch", () => {
    const store = memStore();
    saveSnapshot(store, emptySnapshot(A)); saveSnapshot(store, emptySnapshot(B)); store.setItem("canx-manager-text-size", "24");
    clearOtherOwners(store, B);
    expect([...store.data.keys()].filter(k => k.startsWith(ASTRA_CACHE_PREFIX))).toEqual([cacheKey(B)]);
    clearAllSnapshots(store);
    expect([...store.data.keys()]).toEqual(["canx-manager-text-size"]);
  });
});

describe("model context: restored completed turns are included, interrupted prompts are not", () => {
  it("interrupted text: an unanswered prompt is shown but excluded from history", () => {
    const thread = modelThread([msg("1-u", "user", "Create gate task"), msg("1-a", "assistant", "Task t1 created"), msg("2-u", "user", "Delete all receipts")]);
    expect(thread).toEqual([{ role: "user", content: "Create gate task" }, { role: "assistant", content: "Task t1 created" }]);
  });

  it("interrupted voice: a spoken line cut off by lost service is never replayed as history", () => {
    const voice = [msg("v-u", "user", "Assign that to operations"), msg("w-u", "user", "Are you there?"), msg("w-a", "assistant", "Yes")];
    expect(modelThread(voice).map(m => m.content)).toEqual(["Are you there?", "Yes"]);
  });

  it("restored account turns merge without duplicates, in time order", () => {
    const local = [msg(`${T1}-u`, "user", "one", "2026-09-25T00:00:01Z"), msg(`${T1}-a`, "assistant", "ok", "2026-09-25T00:00:02Z")];
    const remote = [...turnMessages({ turnId: T1, user: "one", answer: "ok", at: "2026-09-25T00:00:01Z", mode: "text" }),
      ...turnMessages({ turnId: T2, user: "zero", answer: "earlier", at: "2026-09-24T00:00:00Z", mode: "voice" })];
    const merged = mergeMessages(local, remote);
    expect(merged.map(m => m.id)).toEqual([`${T2}-u`, `${T2}-a`, `${T1}-u`, `${T1}-a`]);
    expect(modelThread(merged)).toHaveLength(4);
  });
});

describe("outbox: persistence only, no duplicates, no action replay", () => {
  const turn = (id: string) => ({ turnId: id, user: "u", answer: "a", at: "2026-09-25T00:00:00Z", mode: "text" as const });

  it("the same turn is queued once", () => {
    let s = enqueueTurn(emptySnapshot(A), turn(T1));
    s = enqueueTurn(s, turn(T1));
    expect(s.pending).toHaveLength(1);
  });

  it("keeps unsynced turns after no service, then syncs each once on reconnect", async () => {
    let s = enqueueTurn(enqueueTurn(emptySnapshot(A), turn(T1)), turn(T2));
    const offline = await flushPending(s.pending, async () => { throw new Error("offline"); });
    expect(offline.synced).toEqual([]);
    s = markSynced(s, offline.synced);
    expect(s.pending).toHaveLength(2);
    const append = vi.fn(async (_t: PendingTurn) => ({ ok: true, state: "saved" as const, message: "" }));
    const online = await flushPending(s.pending, append);
    s = markSynced(s, online.synced);
    expect(s.pending).toHaveLength(0);
    expect(append.mock.calls.map(c => c[0].turnId)).toEqual([T1, T2]);
  });

  it("auth denial stops the flush and keeps the turn on the device", async () => {
    const s = enqueueTurn(emptySnapshot(A), turn(T1));
    const r = await flushPending(s.pending, async () => ({ ok: false, state: "denied", message: "Sign in again." }));
    expect(r.stopped?.state).toBe("denied");
    expect(markSynced(s, r.synced).pending).toHaveLength(1);
  });

  it("OfficeManager only flushes checkpoints and never replays chat, rooms or approvals", () => {
    const src = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    const flush = src.slice(src.indexOf("const flushCheckpoints"), src.indexOf("const queueTurn"));
    expect(flush).toContain("appendCheckpoint(");
    expect(flush).not.toMatch(/sendChat|roomCommandRef|requestApproval|realtimeManager/);
    expect(src).toContain("if (reply.ok && reply.persisted === true) voicePairerRef.current.markServerSaved(request);");
    expect(src).toContain("modelThread(messagesRef.current)");
    expect(src).toContain("not saved in CanX Brain");
  });

  it("sign-out clears the device copy in the owner session", () => {
    const src = readFileSync("src/lib/owner-session.tsx", "utf8");
    expect(src.match(/clearAllSnapshots\(browserStore\(\)\)/g)?.length).toBe(2);
  });
});

describe("account checkpoint server functions", () => {
  const OWNER = { ok: true as const, userId: A, email: "o@x.test", aal: "aal2" };
  const input = { turnId: T1, seq: 1, user: "Plan Monday", answer: "Agenda drafted", at: "2026-09-25T00:00:00Z", mode: "voice" };

  function deps(rest: Rest, verify = async () => OWNER as never): CheckpointDeps { return { verify, rest: () => rest }; }

  it("denies before any database call without a verified owner", async () => {
    const rest = vi.fn() as unknown as Rest;
    const r = await appendCheckpointWith(deps(rest, async () => ({ ok: false, reason: "mfa_required", message: "Two-step required" }) as never), { accessToken: "t", turn: input });
    expect(r.state).toBe("denied");
    expect((await loadCheckpointWith(deps(rest, async () => ({ ok: false, reason: "no_session", message: "x" }) as never), { accessToken: "" })).ok).toBe(false);
    expect(rest).not.toHaveBeenCalled();
  });

  it("saves once with an exact readback; a repeat is reported as a duplicate, not a second row", async () => {
    const rows = new Map<string, { user_text: string; answer_text: string }>();
    const rest: Rest = async (path, init) => {
      if (path === "rpc/append_astra_checkpoint") {
        const b = JSON.parse(String(init?.body));
        const inserted = !rows.has(b._turn_id);
        if (inserted) rows.set(b._turn_id, { user_text: b._user_text, answer_text: b._answer_text });
        return { ok: true, status: 200, body: [{ turn_id: b._turn_id, server_seq: 1, inserted }] };
      }
      expect(path).toContain(`owner_id=eq.${A}`);
      const row = rows.get(T1);
      return { ok: true, status: 200, body: row ? [{ turn_id: T1, ...row }] : [] };
    };
    expect((await appendCheckpointWith(deps(rest), { accessToken: "t", turn: input })).state).toBe("saved");
    expect((await appendCheckpointWith(deps(rest), { accessToken: "t", turn: input })).state).toBe("duplicate");
    expect(rows.size).toBe(1);
  });

  it("does not claim a save when the readback is missing or different", async () => {
    const rest: Rest = async (path) => path.startsWith("rpc/") ? { ok: true, status: 200, body: [{ inserted: true }] } : { ok: true, status: 200, body: [{ user_text: "other", answer_text: "x" }] };
    const r = await appendCheckpointWith(deps(rest), { accessToken: "t", turn: input });
    expect(r.ok).toBe(false);
    expect(r.state).toBe("failed");
  });

  it("reports the unapplied migration as unavailable, and read failures honestly", async () => {
    const missing: Rest = async () => ({ ok: false, status: 404, body: { code: "PGRST202" } });
    expect((await appendCheckpointWith(deps(missing), { accessToken: "t", turn: input })).state).toBe("unavailable");
    const load = await loadCheckpointWith(deps(async () => ({ ok: false, status: 404, body: { code: "PGRST205" } })), { accessToken: "t" });
    expect(load.ok ? "" : load.state).toBe("unavailable");
    const down = await loadCheckpointWith(deps(async () => ({ ok: false, status: 500, body: null })), { accessToken: "t" });
    expect(down.ok).toBe(false);
    expect(down.message).toContain("could not be read");
  });

  it("loads verified turns oldest first and rejects malformed rows and inputs", async () => {
    const rest: Rest = async () => ({ ok: true, status: 200, body: [
      { turn_id: T2, mode: "text", user_text: "b", answer_text: "B", server_seq: 2, client_at: "2026-09-25T00:00:02Z" },
      { turn_id: T1, mode: "voice", user_text: "a", answer_text: "A", server_seq: 1, client_at: "2026-09-25T00:00:01Z" },
      { turn_id: "bad", user_text: "x" },
    ] });
    const r = await loadCheckpointWith(deps(rest), { accessToken: "t" });
    expect(r.ok && r.turns.map(t => t.turnId)).toEqual([T1, T2]);
    expect((await appendCheckpointWith(deps(rest), { accessToken: "t", turn: { ...input, turnId: "x&owner_id=other" } })).ok).toBe(false);
  });

  it("migration is unapplied, owner-scoped, idempotent, bounded and audited", () => {
    const sql = readFileSync("docs/migrations/0008_astra_conversation_checkpoints.sql", "utf8");
    expect(sql).toContain("NOT APPLIED");
    expect(sql).toMatch(/unique \(owner_id, turn_id\)/);
    expect(sql).toContain("grant select on public.astra_conversation_checkpoints to authenticated");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("is_verified_owner()");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("next_seq - 200");
    expect(sql).toContain("office_audit");
    expect(sql).not.toMatch(/to anon/);
  });
});
