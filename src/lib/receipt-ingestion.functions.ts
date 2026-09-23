import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
import type { GmailFetchResult, GmailSettings } from "./gmail-receipts.server";
import {
  MAX_GMAIL_CANDIDATES,
  parseReceiptCandidate,
  safeIngestionSummary,
  type IngestibleReceipt,
} from "./receipt-ingestion";
import type { FinanceReceipt } from "./finance-receipts";

const EXPLICIT_RECEIPT_SYNC_INTENT = /\b(?:review|retrieve|check|find|sync|file|import)\b[^.\n]{0,80}\b(?:receipts?|invoices?)\b|\b(?:receipts?|invoices?)\b[^.\n]{0,80}\b(?:review|retrieve|check|find|sync|file|import)\b/i;
const RESCAN_INTENT = /\b(?:rescan|scan again|full scan|re-scan)\b/i;

export function isExplicitReceiptSyncRequest(message: string): boolean {
  // Only a short, dedicated command may bypass the general conversation.
  // Multi-step reviews mentioning receipts must reach Astra in full.
  const command = message.trim();
  if (command.length > 240 || /[\r\n]/.test(command)) return false;
  if (/\b(?:do not|don’t|don't|never|without)\b/i.test(command)) return false;
  return /^(?:(?:astra|data)[, :]*)?(?:please\s+)?(?:review|retrieve|check|find|sync|file|import|rescan)\b/i.test(command)
    && EXPLICIT_RECEIPT_SYNC_INTENT.test(command);
}

export type ReceiptSyncCode =
  | "ok"
  | "invalid_request"
  | "auth_not_ready"
  | "gmail_authorization_required"
  | "database_unavailable"
  | "gmail_unavailable"
  | "write_unverified";

export interface ReceiptSyncResult {
  ok: boolean;
  code: ReceiptSyncCode;
  message: string;
  filed: number;
  duplicatesSkipped: number;
  needsReview: number;
  receipts: Array<{
    vendor: string;
    documentType: string;
    date: string;
    total: number | null;
    currency: string | null;
    paymentStatus: string;
    dueDate: string | null;
    expectedRenewalDate: string | null;
    expectedRenewalBasis: string | null;
    accountantReviewStatus: string;
  }>;
  totalsByCurrency: Array<{ currency: string; count: number; total: number | null }>;
}

const deny = (code: ReceiptSyncCode, message: string): ReceiptSyncResult => ({
  ok: false,
  code,
  message,
  filed: 0,
  duplicatesSkipped: 0,
  needsReview: 0,
  receipts: [],
  totalsByCurrency: [],
});

export interface SyncDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  gmailSettings: () => GmailSettings | null;
  readState: (token: string) => Promise<{ ok: boolean; checkpoint: string | null; receipts: FinanceReceipt[] }>;
  fetchCandidates: (settings: GmailSettings, checkpoint: string | null, rescan: boolean) => Promise<GmailFetchResult>;
  atomicWrite: (
    token: string,
    ownerId: string,
    receipts: IngestibleReceipt[],
    checkpoint: string,
  ) => Promise<{ ok: boolean; filed: IngestibleReceipt[]; duplicates: number; allReceipts: FinanceReceipt[] }>;
}

async function realDeps(): Promise<SyncDeps> {
  const backend = await import("./canx-backend.server");
  const gmail = await import("./gmail-receipts.server");
  return {
    verifyOwner: backend.verifyOwner,
    gmailSettings: gmail.readGmailSettings,
    readState: async (token) => {
      const config = backend.readBackendConfig();
      if (!config) return { ok: false, checkpoint: null, receipts: [] };
      const response = await backend.restRequest(config, token, "finance_receipts?select=doc,gmail_sync_checkpoint,ingested_receipts&limit=1");
      if (!response.ok) return { ok: false, checkpoint: null, receipts: [] };
      const row = Array.isArray(response.body) ? (response.body[0] as { doc?: { receipts?: unknown }; gmail_sync_checkpoint?: string; ingested_receipts?: unknown }) : null;
      const legacy = Array.isArray(row?.doc?.receipts) ? (row.doc.receipts as FinanceReceipt[]) : [];
      const ingested = Array.isArray(row?.ingested_receipts) ? (row.ingested_receipts as FinanceReceipt[]) : [];
      return { ok: true, checkpoint: row?.gmail_sync_checkpoint ?? null, receipts: [...legacy, ...ingested] };
    },
    fetchCandidates: gmail.fetchGmailReceiptCandidates,
    atomicWrite: async (token, ownerId, receipts, checkpoint) => {
      const config = backend.readBackendConfig();
      if (!config) return { ok: false, filed: [], duplicates: 0, allReceipts: [] };
      const response = await backend.restRequest(config, token, "rpc/ingest_finance_receipts", {
        method: "POST",
        body: JSON.stringify({ _owner_id: ownerId, _candidates: receipts, _checkpoint: checkpoint }),
      });
      if (!response.ok || !response.body || typeof response.body !== "object") {
        return { ok: false, filed: [], duplicates: 0, allReceipts: [] };
      }
      const body = response.body as { filed?: unknown; duplicates_skipped?: unknown };
      const filed = Array.isArray(body.filed) ? (body.filed as IngestibleReceipt[]) : [];
      const reread = await backend.restRequest(config, token, "finance_receipts?select=doc,ingested_receipts&limit=1");
      const row = reread.ok && Array.isArray(reread.body) ? (reread.body[0] as { doc?: { receipts?: unknown }; ingested_receipts?: unknown }) : null;
      const legacy = Array.isArray(row?.doc?.receipts) ? (row.doc.receipts as FinanceReceipt[]) : [];
      const ingested = Array.isArray(row?.ingested_receipts) ? (row.ingested_receipts as FinanceReceipt[]) : [];
      const filedVerified = filed.every((receipt) =>
        ingested.some((stored) => (stored as Partial<IngestibleReceipt>).contentFingerprint === receipt.contentFingerprint),
      );
      return {
        ok: reread.ok && filedVerified,
        filed,
        duplicates: typeof body.duplicates_skipped === "number" ? body.duplicates_skipped : 0,
        allReceipts: [...legacy, ...ingested],
      };
    },
  };
}

export async function runReceiptSync(input: { accessToken: string; request: string }) {
  return runReceiptSyncWith(await realDeps(), input);
}

export async function runReceiptSyncWith(
  deps: SyncDeps,
  input: { accessToken: string; request: string },
): Promise<ReceiptSyncResult> {
  if (!isExplicitReceiptSyncRequest(input.request)) {
    return deny("invalid_request", "Ask explicitly to review, retrieve, check, sync, file, or import receipts or invoices.");
  }
  const owner = await deps.verifyOwner(input.accessToken);
  if (!owner.ok) return deny("auth_not_ready", owner.message);
  const settings = deps.gmailSettings();
  if (!settings) {
    return deny(
      "gmail_authorization_required",
      "Receipt retrieval is ready, but the CanX Gmail connection must be authorized for this project first. No mailbox or Finance record was touched.",
    );
  }
  const state = await deps.readState(input.accessToken);
  if (!state.ok) return deny("database_unavailable", "Finance records could not be read, so Gmail was not contacted and nothing was filed.");

  let fetched: GmailFetchResult;
  try {
    fetched = await deps.fetchCandidates(settings, state.checkpoint, RESCAN_INTENT.test(input.request));
  } catch (error) {
    return deny(
      error instanceof Error && error.message === "gmail_authorization_required" ? "gmail_authorization_required" : "gmail_unavailable",
      "CanX Gmail could not be read. Re-authorize the CanX Gmail connection, then try again. Nothing was filed.",
    );
  }

  const parsed: IngestibleReceipt[] = [];
  let malformed = fetched.unsupported;
  for (const document of fetched.documents.slice(0, MAX_GMAIL_CANDIDATES)) {
    const result = parseReceiptCandidate(document);
    if (result.ok && result.receipt) parsed.push(result.receipt);
    else malformed += 1;
  }
  const written = await deps.atomicWrite(input.accessToken, owner.userId, parsed, fetched.checkpoint);
  if (!written.ok) return deny("write_unverified", "The Finance write could not be verified, so no receipt is reported as filed. Check the CanX database and retry.");
  const summary = safeIngestionSummary(written.allReceipts, written.filed, written.duplicates, malformed + written.filed.length);
  return {
    ok: true,
    code: "ok",
    message: `Receipt review finished: ${summary.filed} new filed, ${summary.duplicatesSkipped} duplicates skipped, ${summary.needsReview} needing review.`,
    ...summary,
  };
}

function validate(input: unknown) {
  const row = input as { accessToken?: unknown; request?: unknown } | undefined;
  return {
    accessToken: typeof row?.accessToken === "string" ? row.accessToken.slice(0, 4_000) : "",
    request: typeof row?.request === "string" ? row.request.slice(0, 2_000) : "",
  };
}

export const syncGmailReceipts = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => runReceiptSync(data));
