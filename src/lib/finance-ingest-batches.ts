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

const normalized = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const extended = (receipt: FinanceReceipt) => receipt as FinanceReceipt & Partial<IngestibleReceipt>;

/** Mirrors migration 0004's authenticated duplicate contract across legacy and ingested rows. */
export function matchesStoredCandidate(candidate: IngestibleReceipt, stored: FinanceReceipt): boolean {
  const row = extended(stored);
  const sameSource = Boolean(candidate.gmailMessageId && candidate.attachmentIdentity)
    && row.gmailMessageId === candidate.gmailMessageId
    && row.attachmentIdentity === candidate.attachmentIdentity;
  const storedInvoice = normalized(row.invoiceNumber || stored.orderNumber);
  const sameInvoice = Boolean(candidate.invoiceNumber)
    && normalized(stored.vendor) === normalized(candidate.vendor)
    && storedInvoice === normalized(candidate.invoiceNumber);
  const sameFingerprint = Boolean(candidate.contentFingerprint)
    && row.contentFingerprint === candidate.contentFingerprint;
  const legacyMessage = Boolean(candidate.gmailMessageId)
    && stored.sourceMessageIds.includes(candidate.gmailMessageId);
  return sameSource || sameInvoice || sameFingerprint || legacyMessage;
}

/** A newly filed row must preserve the candidate itself, not merely match an older duplicate key. */
function matchesFiledCandidate(candidate: IngestibleReceipt, stored: FinanceReceipt): boolean {
  const row = extended(stored);
  return row.contentFingerprint === candidate.contentFingerprint
    && row.gmailMessageId === candidate.gmailMessageId
    && row.attachmentIdentity === candidate.attachmentIdentity
    && normalized(stored.vendor) === normalized(candidate.vendor)
    && stored.total === candidate.total;
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
  const filedFingerprints = new Set(filed.map((receipt) => receipt.contentFingerprint));
  // New rows need exact saved identity/content. RPC-declared duplicates use the
  // SQL duplicate contract against both legacy and ingested records.
  const confirmedFiled = back.ok
    ? filed.filter((candidate) => back.ingested.some((stored) => matchesFiledCandidate(candidate, stored)))
    : [];
  const confirmedFiledFingerprints = new Set(confirmedFiled.map((receipt) => receipt.contentFingerprint));
  const unverified = back.ok
    ? receipts.filter((candidate) => filedFingerprints.has(candidate.contentFingerprint)
      ? !confirmedFiledFingerprints.has(candidate.contentFingerprint)
      : !back.all.some((stored) => matchesStoredCandidate(candidate, stored)))
      .map((candidate) => candidate.contentFingerprint)
    : receipts.map((candidate) => candidate.contentFingerprint);
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
