import { describe, expect, it, vi } from "vitest";
import { casUpdateFinanceDoc, sameContent, type Doc } from "./finance-doc-cas.server";
import { runReceiptSyncWith, type GmailContinuation, type SyncDeps } from "./receipt-ingestion.functions";
import { normalizeWorkerId, validateConsultRequest, workerById } from "./manager-workers";

/** In-memory PostgREST row honouring the conditional PATCH (eq filters), like the real row lock. */
function fakeDb(initial: Doc | null) {
  const row: { doc: Doc; updated_at: string } | null = initial ? { doc: structuredClone(initial), updated_at: "2026-10-03T18:00:00.000+00:00" } : null;
  const state = { row, patches: 0, zeroRow: 0, beforePatch: null as null | (() => void) };
  const rest = vi.fn(async (_c: never, _t: string, path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return { ok: true, status: 200, body: state.row ? [{ doc: structuredClone(state.row.doc), updated_at: state.row.updated_at }] : [] };
    if (method === "POST") {
      if (!state.row) state.row = { doc: JSON.parse(String(init!.body))[0].doc, updated_at: "2026-10-03T17:00:00.000+00:00" };
      return { ok: true, status: 201, body: null };
    }
    // PATCH
    state.patches += 1;
    state.beforePatch?.();
    const seen = decodeURIComponent(/updated_at=eq\.([^&]+)/.exec(path)![1]!);
    expect(path).toContain("owner_id=eq.owner");
    if (!state.row || state.row.updated_at !== seen) { state.zeroRow += 1; return { ok: true, status: 200, body: [] }; }
    const body = JSON.parse(String(init!.body)) as { doc: Doc; updated_at: string };
    state.row = { doc: body.doc, updated_at: body.updated_at };
    return { ok: true, status: 200, body: [{ doc: structuredClone(state.row.doc), updated_at: state.row.updated_at }] };
  });
  return { state, rest };
}

const seed = (): Doc => ({
  schemaVersion: 1, kind: "canx-finance-receipts",
  receipts: [{ id: "r1", vendor: "Lovable" }],
  subscriptions: [{ id: "s1", name: "Lovable" }],
  subscriptionEvidence: [{ id: "e1", review: "needs-review" }],
});

const run = (db: ReturnType<typeof fakeDb>, mutate: (d: Doc) => Doc | null, verify: (d: Doc) => boolean, maxAttempts?: number) =>
  casUpdateFinanceDoc({ rest: db.rest as never, config: {}, token: "t", ownerId: "owner", mutate, verify, ...(maxAttempts ? { maxAttempts } : {}) });

describe("Finance doc compare-and-swap", () => {
  it("overlapping receipt save and evidence review both survive (zero-row update then merge)", async () => {
    const db = fakeDb(seed());
    let interleaved = false;
    db.state.beforePatch = () => {
      if (interleaved) return;
      interleaved = true;
      // Another writer commits between our read and our conditional PATCH.
      db.state.row = { doc: { ...db.state.row!.doc, subscriptionEvidence: [{ id: "e1", review: "reviewed" }] }, updated_at: "2026-10-03T18:00:05.000+00:00" };
    };
    const receipts = [{ id: "r1", vendor: "Lovable" }, { id: "r2", vendor: "OpenAI" }];
    const res = await run(db, (d) => ({ ...d, receipts }), (d) => sameContent(d["receipts"], receipts));
    expect(res.ok).toBe(true);
    expect(db.state.zeroRow).toBe(1);
    expect(db.state.row!.doc["receipts"]).toEqual(receipts);
    expect(db.state.row!.doc["subscriptionEvidence"]).toEqual([{ id: "e1", review: "reviewed" }]);
    expect(db.state.row!.doc["subscriptions"]).toEqual([{ id: "s1", name: "Lovable" }]);
  });

  it("fails explicitly (not saved) when conflicts persist past the bound", async () => {
    const db = fakeDb(seed());
    let n = 0;
    db.state.beforePatch = () => { n += 1; db.state.row = { ...db.state.row!, updated_at: `2026-10-03T18:01:0${n}.000+00:00` }; };
    const res = await run(db, (d) => ({ ...d, subscriptions: [] }), () => true, 3);
    expect(res).toMatchObject({ ok: false, reason: "conflict", attempts: 3 });
    expect(db.state.row!.doc["subscriptions"]).toEqual([{ id: "s1", name: "Lovable" }]);
  });

  it("verifies actual content, not just length", async () => {
    const db = fakeDb(seed());
    const wanted = [{ id: "s1", name: "Changed" }];
    db.rest.mockImplementationOnce(db.rest.getMockImplementation()!); // GET
    const original = db.rest.getMockImplementation()!;
    db.rest.mockImplementation(async (c, t, p, i) => {
      const r = await original(c, t, p, i);
      if (i?.method === "PATCH") return { ...r, body: [{ doc: { ...seed(), subscriptions: [{ id: "s1", name: "Tampered" }] } }] };
      return r;
    });
    const res = await run(db, (d) => ({ ...d, subscriptions: wanted }), (d) => sameContent(d["subscriptions"], wanted));
    expect(res).toMatchObject({ ok: false, reason: "unverified" });
  });

  it("creates a missing row without overwriting and then updates it", async () => {
    const db = fakeDb(null);
    const res = await run(db, (d) => ({ ...d, subscriptions: [{ id: "s9" }] }), (d) => sameContent(d["subscriptions"], [{ id: "s9" }]));
    expect(res.ok).toBe(true);
  });

  it("key order differences from jsonb do not fail verification", () => {
    expect(sameContent({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameContent([1, 2], [2, 1])).toBe(false);
  });
});

const owner = { ok: true as const, userId: "owner", email: "", aal: "aal2" as const };
const acct = { lovableApiKey: "x", connectionApiKey: "y" };
function syncDeps(over: Partial<SyncDeps> = {}) {
  const saveContinuation = vi.fn(async (_t: string, _o: string, _n: GmailContinuation) => true);
  const deps: SyncDeps = {
    verifyOwner: async () => owner,
    gmailAccounts: () => [acct],
    readState: async () => ({ ok: true, checkpoint: "cp", receipts: [], continuation: {} }),
    fetchCandidates: vi.fn(async () => ({ documents: [], checkpoint: "now", unsupported: 0, partial: true, mailbox: "a@x.com", nextPageToken: "P2", fetchFailures: 0 })),
    atomicWrite: vi.fn(async () => ({ ok: true, filed: [], duplicates: 0, allReceipts: [] })),
    saveContinuation,
    ...over,
  };
  return { deps, saveContinuation };
}

describe("Gmail continuation", () => {
  it("saves the next page token and keeps the date checkpoint when capped", async () => {
    const { deps, saveContinuation } = syncDeps();
    const r = await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts" });
    expect(r.partial).toBe(true);
    expect(saveContinuation.mock.calls[0]![2]["a@x.com"]!.token).toBe("P2");
    expect((deps.atomicWrite as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toBe("cp");
    expect(r.message).toContain("continue with older");
  });

  it("passes a saved token for the same query on the next run, and not on a rescan", async () => {
    let queryKey = "";
    const first = syncDeps();
    await runReceiptSyncWith(first.deps, { accessToken: "t", request: "check receipts" });
    queryKey = first.saveContinuation.mock.calls[0]![2]["a@x.com"]!.query;
    const { deps } = syncDeps({ readState: async () => ({ ok: true, checkpoint: "cp", receipts: [], continuation: { "a@x.com": { token: "P2", query: queryKey, savedAt: "" } } }) });
    await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts" });
    expect((deps.fetchCandidates as ReturnType<typeof vi.fn>).mock.calls[0]![4]).toEqual({ "a@x.com": "P2" });
    const again = syncDeps({ readState: async () => ({ ok: true, checkpoint: "cp", receipts: [], continuation: { "a@x.com": { token: "P2", query: queryKey, savedAt: "" } } }) });
    await runReceiptSyncWith(again.deps, { accessToken: "t", request: "review receipts, full scan" });
    expect((again.deps.fetchCandidates as ReturnType<typeof vi.fn>).mock.calls[0]![4]).toEqual({});
  });

  it("does not advance past a page with unfetched messages", async () => {
    const prior = { "a@x.com": { token: "P1", query: "old", savedAt: "" } };
    const { deps, saveContinuation } = syncDeps({
      readState: async () => ({ ok: true, checkpoint: "cp", receipts: [], continuation: prior }),
      fetchCandidates: async () => ({ documents: [], checkpoint: "now", unsupported: 1, partial: true, mailbox: "a@x.com", nextPageToken: "P9", fetchFailures: 1 }),
    });
    await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts" });
    expect(saveContinuation.mock.calls[0]![2]).toEqual(prior);
  });

  it("does not save a position when the Finance write is unverified", async () => {
    const { deps, saveContinuation } = syncDeps({ atomicWrite: async () => ({ ok: false, filed: [], duplicates: 0, allReceipts: [] }) });
    const r = await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts" });
    expect(r.ok).toBe(false);
    expect(saveContinuation).not.toHaveBeenCalled();
  });
});

describe("worker id legacy alias", () => {
  it("maps w-systems-security to the registered seat; unknown ids still fail", () => {
    expect(normalizeWorkerId("w-systems-security")).toBe("w-quality-security");
    expect(workerById("w-systems-security")?.id).toBe("w-quality-security");
    expect(validateConsultRequest({ workerId: "w-systems-security", room: "systems", question: "q" }).ok).toBe(true);
    const bad = validateConsultRequest({ workerId: "w-made-up", question: "q" });
    expect(bad.ok).toBe(false);
  });
});
