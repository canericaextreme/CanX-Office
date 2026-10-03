import { describe, expect, it, vi } from "vitest";
import { ingestInBatches, RPC_CANDIDATE_LIMIT, type IngestDeps } from "./finance-ingest-batches";
import { runReceiptSyncWith, type SyncDeps } from "./receipt-ingestion.functions";
import type { CandidateDocument, IngestibleReceipt } from "./receipt-ingestion";
import type { FinanceReceipt } from "./finance-receipts";

/** Contract mock of the deployed ingest_finance_receipts RPC (0004 migration). */
function fakeDb(opts: { failBatchOnce?: number; failBatchAlways?: number } = {}) {
  const rows: FinanceReceipt[] = [];
  let checkpoint = "OLD";
  let call = 0;
  const seen = new Map<string, number>();
  const failedOnce = new Set<number>();
  const checkpoints: string[] = [];
  const rpc = vi.fn(async (candidates: IngestibleReceipt[], cp: string) => {
    if (candidates.length > 25) throw new Error("invalid candidates"); // the real SQL limit
    const key = candidates[0]?.contentFingerprint ?? "";
    if (key && !seen.has(key)) seen.set(key, call++);
    const batchNo = key ? seen.get(key)! : -1;
    if (opts.failBatchAlways !== undefined && batchNo === opts.failBatchAlways) return { ok: false, filed: [], duplicates: 0 };
    if (opts.failBatchOnce !== undefined && batchNo === opts.failBatchOnce && !failedOnce.has(batchNo)) {
      failedOnce.add(batchNo);
      return { ok: false, filed: [], duplicates: 0 };
    }
    const filed: IngestibleReceipt[] = [];
    let duplicates = 0;
    for (const c of candidates) {
      if (rows.some((r) => (r as Partial<IngestibleReceipt>).contentFingerprint === c.contentFingerprint)) duplicates++;
      else { rows.push(c); filed.push(c); }
    }
    checkpoint = cp;
    checkpoints.push(cp);
    return { ok: true, filed, duplicates };
  });
  const deps: IngestDeps = { rpc, reread: async () => ({ ok: true, ingested: [...rows], all: [...rows] }) };
  return { deps, rpc, rows, checkpoints, get checkpoint() { return checkpoint; } };
}

const receipt = (i: number) => ({ contentFingerprint: `fp-${i}`, vendor: "OpenAI", total: i + 1, currency: "USD" }) as unknown as IngestibleReceipt;
const fifty = Array.from({ length: 50 }, (_, i) => receipt(i));

describe("batched RPC writer (<=25 per call)", () => {
  it("writes 50 unique receipts in two batches and verifies all fingerprints", async () => {
    const db = fakeDb();
    const r = await ingestInBatches(db.deps, fifty, "OLD");
    expect(db.rpc.mock.calls.every(([c]) => c.length <= RPC_CANDIDATE_LIMIT)).toBe(true);
    expect(r).toMatchObject({ ok: true, batchesTotal: 2, batchesWritten: 2, unverified: [] });
    expect(r.filed).toHaveLength(50);
  });
  it("retries a transient second-batch failure once (dedup-safe)", async () => {
    const db = fakeDb({ failBatchOnce: 1 });
    const r = await ingestInBatches(db.deps, fifty, "OLD");
    expect(r.ok).toBe(true);
    expect(db.rows).toHaveLength(50);
  });
  it("persistent second-batch failure keeps real filed count and is unverified", async () => {
    const db = fakeDb({ failBatchAlways: 1 });
    const r = await ingestInBatches(db.deps, fifty, "OLD");
    expect(r.ok).toBe(false);
    expect(r.filed).toHaveLength(25);
    expect(r.unverified).toHaveLength(25);
  });
  it("verifies duplicates too, not only the returned filed list", async () => {
    const db = fakeDb();
    await ingestInBatches(db.deps, fifty.slice(0, 10), "OLD");
    const r = await ingestInBatches(db.deps, fifty.slice(0, 10), "OLD");
    expect(r).toMatchObject({ ok: true, duplicates: 10, unverified: [] });
    const lying = await ingestInBatches({ rpc: async () => ({ ok: true, filed: [], duplicates: 1 }), reread: async () => ({ ok: true, ingested: [], all: [] }) }, [receipt(99)], "OLD");
    expect(lying.ok).toBe(false);
  });
});

const owner = { ok: true as const, userId: "o", email: "", aal: "aal2" as const };
const doc = (i: number, mb: string): CandidateDocument => ({
  messageId: `${mb}${i}`, attachmentIdentity: "body", filename: "", mimeType: "text/plain",
  text: `Vendor: OpenAI Invoice # OA-${mb}-${i} Date: 2026-09-01 Total: USD ${i + 1}.${mb === "a" ? "10" : "20"} Currency: USD Amount paid`,
  mailbox: `${mb}@x.com`, from: "OpenAI <billing@openai.com>", subject: "Your receipt", receivedAt: "2026-10-01T12:00:00Z",
});

function syncDeps(db: ReturnType<typeof fakeDb>, over: Partial<SyncDeps> = {}) {
  const cont = vi.fn(async () => true);
  const d: SyncDeps = {
    verifyOwner: async () => owner,
    gmailAccounts: () => [{ lovableApiKey: "x", connectionApiKey: "a" }, { lovableApiKey: "x", connectionApiKey: "b" }],
    readState: async () => ({ ok: true, checkpoint: "OLD", receipts: [], subscriptions: [], evidence: [] }),
    fetchCandidates: async (s) => ({ documents: Array.from({ length: 25 }, (_, i) => doc(i, s.connectionApiKey)), checkpoint: "NEW", unsupported: 0, partial: false, mailbox: `${s.connectionApiKey}@x.com`, fetchFailures: 0 }),
    atomicWrite: (_t, _o, receipts, cp) => ingestInBatches(db.deps, receipts, cp),
    writeEvidence: async (_t, _o, e) => ({ ok: true, added: e.length, duplicates: 0 }),
    recordLastCheck: async () => true,
    saveContinuation: cont,
    ...over,
  };
  return { d, cont };
}
const req = { accessToken: "t", request: "check receipts" };

describe("sync runner with the real SQL limit", () => {
  it("files 50 receipts from two mailboxes; checkpoint advances only at the end", async () => {
    const db = fakeDb();
    const r = await runReceiptSyncWith(syncDeps(db).d, req);
    expect(r.ok).toBe(true);
    expect(db.rows).toHaveLength(50);
    expect(db.checkpoints.slice(0, -1).every((c) => c === "OLD")).toBe(true);
    expect(db.checkpoint).not.toBe("OLD");
  });
  it("second-batch failure: reports real saved count, keeps checkpoint and page", async () => {
    const db = fakeDb({ failBatchAlways: 1 });
    const { d, cont } = syncDeps(db);
    const r = await runReceiptSyncWith(d, req);
    expect(r.ok).toBe(false);
    expect(r.filed).toBe(25);
    expect(r.partial).toBe(true);
    expect(r.message).toMatch(/25 receipt\(s\) were saved/);
    expect(db.checkpoint).toBe("OLD");
    expect(cont).not.toHaveBeenCalled();
  });
  it("evidence failure: receipts saved but checkpoint not advanced", async () => {
    const db = fakeDb();
    const { d } = syncDeps(db, {
      readState: async () => ({ ok: true, checkpoint: "OLD", receipts: [], subscriptions: (await import("./subscriptions")).STARTER_SUBSCRIPTIONS, evidence: [] }),
      writeEvidence: async () => ({ ok: false, added: 0, duplicates: 0 }),
    });
    const r = await runReceiptSyncWith(d, req);
    expect(r.partial).toBe(true);
    expect(db.checkpoint).toBe("OLD");
  });
});
