/**
 * Sequential batching for the deployed `ingest_finance_receipts` RPC, which
 * rejects more than 25 candidates per call. Pure and dependency-injected so the
 * SQL limit can be contract-tested without a database.
 */
import type { FinanceReceipt } from "./finance-receipts";
import type { IngestibleReceipt } from "./receipt-ingestion";

export const RPC_CANDIDATE_LIMIT = 25;
const ATTEMPTS_PER_BATCH = 2; // safe: the RPC deduplicates by fingerprint

export interface RpcResult { ok: boolean; filed: IngestibleReceipt[]; duplicates: number }
export interface IngestDeps {
  rpc: (candidates: IngestibleReceipt[], checkpoint: string) => Promise<RpcResult>;
  reread: () => Promise<{ ok: boolean; ingested: FinanceReceipt[]; all: FinanceReceipt[] }>;
}
export interface BatchedOutcome {
  ok: boolean;
  filed: IngestibleReceipt[];
  duplicates: number;
  allReceipts: FinanceReceipt[];
  batchesTotal: number;
  batchesWritten: number;
  /** Candidate fingerprints not found in the stored rows after readback. */
  unverified: string[];
}

export async function ingestInBatches(deps: IngestDeps, receipts: IngestibleReceipt[], checkpoint: string): Promise<BatchedOutcome> {
  const batches: IngestibleReceipt[][] = [];
  for (let i = 0; i < receipts.length; i += RPC_CANDIDATE_LIMIT) batches.push(receipts.slice(i, i + RPC_CANDIDATE_LIMIT));
  if (batches.length === 0) batches.push([]); // a checkpoint-only call is valid
  const filed: IngestibleReceipt[] = [];
  let duplicates = 0;
  let batchesWritten = 0;
  let failed = false;
  for (const batch of batches) {
    let done = false;
    for (let attempt = 0; attempt < ATTEMPTS_PER_BATCH && !done; attempt++) {
      const r = await deps.rpc(batch, checkpoint).catch(() => ({ ok: false, filed: [], duplicates: 0 }));
      if (r.ok) {
        filed.push(...r.filed);
        duplicates += r.duplicates;
        done = true;
      }
    }
    if (!done) { failed = true; break; } // stop: later batches stay unwritten, page repeats
    batchesWritten += 1;
  }
  const back = await deps.reread().catch(() => ({ ok: false, ingested: [] as FinanceReceipt[], all: [] as FinanceReceipt[] }));
  const stored = new Set(back.ingested.map((s) => (s as Partial<IngestibleReceipt>).contentFingerprint).filter(Boolean));
  // Verify every candidate (filed or duplicate) is present, not only the returned filed list.
  const unverified = back.ok ? receipts.map((r) => r.contentFingerprint).filter((fp) => !stored.has(fp)) : receipts.map((r) => r.contentFingerprint);
  // Only count as filed what readback confirms.
  const confirmedFiled = back.ok ? filed.filter((f) => stored.has(f.contentFingerprint)) : [];
  return {
    ok: !failed && back.ok && unverified.length === 0,
    filed: confirmedFiled,
    duplicates,
    allReceipts: back.all,
    batchesTotal: batches.length,
    batchesWritten,
    unverified,
  };
}
