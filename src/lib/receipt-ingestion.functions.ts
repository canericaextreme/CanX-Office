import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
import type { GmailFetchResult, GmailSettings } from "./gmail-receipts.server";
import {
  MAX_GMAIL_CANDIDATES,
  fingerprintText,
  parseReceiptCandidate,
  safeIngestionSummary,
  type IngestibleReceipt,
} from "./receipt-ingestion";
import type { FinanceReceipt } from "./finance-receipts";
import {
  buildGmailQuery,
  classifyDocument,
  matchService,
  mergeEvidence,
  type EvidenceKind,
  type MatchStatus,
  type SubscriptionEvidence,
  type SubscriptionRecord,
} from "./subscriptions";

const NOUNS = String.raw`(?:receipts?|invoices?|subscriptions?|renewals?|billing)`;
const VERBS = String.raw`(?:review|retrieve|check|find|sync|file|import)`;
const EXPLICIT_RECEIPT_SYNC_INTENT = new RegExp(String.raw`\b${VERBS}\b[^.\n]{0,80}\b${NOUNS}\b|\b${NOUNS}\b[^.\n]{0,80}\b${VERBS}\b`, "i");
const RESCAN_INTENT = /\b(?:rescan|scan again|full scan|re-scan)\b/i;

export function isExplicitReceiptSyncRequest(message: string): boolean {
  // Only a short, dedicated command may bypass the general conversation.
  // Multi-step reviews mentioning receipts must reach Elsie in full.
  const command = message.trim();
  if (command.length > 240 || /[\r\n]/.test(command)) return false;
  if (/\b(?:do not|don’t|don't|never|without)\b/i.test(command)) return false;
  return /^(?:(?:elsie|astra|data)[, :]*)?(?:please\s+)?(?:review|retrieve|check|find|sync|file|import|rescan)\b/i.test(command)
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
  /** True when any mailbox had more matching mail than the capped page read. */
  partial?: boolean;
  mailboxesChecked?: number;
  mailboxesFailed?: number;
  subscriptionEvidenceAdded?: number;
  subscriptionEvidenceDuplicates?: number;
  sentToReview?: number;
  notFiledPersonal?: number;
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
  /** Every Gmail connection linked to this project; empty when none is linked. */
  gmailAccounts: () => GmailSettings[];
  readState: (token: string) => Promise<{
    ok: boolean;
    checkpoint: string | null;
    receipts: FinanceReceipt[];
    subscriptions?: SubscriptionRecord[];
    evidence?: SubscriptionEvidence[];
  }>;
  fetchCandidates: (settings: GmailSettings, checkpoint: string | null, rescan: boolean, query?: string) => Promise<GmailFetchResult>;
  /** Appends subscription evidence to the owner's Finance document, verified by readback. */
  writeEvidence?: (token: string, ownerId: string, evidence: SubscriptionEvidence[]) => Promise<{ ok: boolean; added: number; duplicates: number }>;
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
    gmailAccounts: gmail.readGmailAccounts,
    readState: async (token) => {
      const config = backend.readBackendConfig();
      if (!config) return { ok: false, checkpoint: null, receipts: [] };
      const response = await backend.restRequest(config, token, "finance_receipts?select=doc,gmail_sync_checkpoint,ingested_receipts&limit=1");
      if (!response.ok) return { ok: false, checkpoint: null, receipts: [] };
      const row = Array.isArray(response.body) ? (response.body[0] as { doc?: { receipts?: unknown }; gmail_sync_checkpoint?: string; ingested_receipts?: unknown }) : null;
      const legacy = Array.isArray(row?.doc?.receipts) ? (row.doc.receipts as FinanceReceipt[]) : [];
      const ingested = Array.isArray(row?.ingested_receipts) ? (row.ingested_receipts as FinanceReceipt[]) : [];
      const subs = await import("./subscriptions");
      const doc = (row?.doc ?? {}) as { subscriptions?: unknown; subscriptionEvidence?: unknown };
      return {
        ok: true,
        checkpoint: row?.gmail_sync_checkpoint ?? null,
        receipts: [...legacy, ...ingested],
        subscriptions: subs.cleanSubscriptionList(doc.subscriptions ?? []) ?? [],
        evidence: subs.cleanEvidenceList(doc.subscriptionEvidence),
      };
    },
    fetchCandidates: (settings, checkpoint, rescan, query) =>
      gmail.fetchGmailReceiptCandidates(settings, checkpoint, rescan, undefined, query),
    writeEvidence: async (token, ownerId, evidence) => {
      const store = await import("./subscriptions-store.server");
      return store.appendEvidence(token, ownerId, evidence);
    },
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
  const accounts = deps.gmailAccounts();
  if (accounts.length === 0) {
    return deny(
      "gmail_authorization_required",
      "Receipt retrieval is ready, but the CanX Gmail connection must be authorized for this project first. No mailbox or Finance record was touched.",
    );
  }
  const state = await deps.readState(input.accessToken);
  if (!state.ok) return deny("database_unavailable", "Finance records could not be read, so Gmail was not contacted and nothing was filed.");
  const subscriptions = state.subscriptions ?? [];
  const query = buildGmailQuery(subscriptions);

  const rescan = RESCAN_INTENT.test(input.request);
  // One shared Finance checkpoint cannot describe several mailboxes: a newly
  // linked or previously failed mailbox would skip older receipts. With more
  // than one mailbox, search the full past-year window (25 per mailbox) and
  // rely on fingerprint dedup instead of a date checkpoint.
  const multi = accounts.length > 1;
  const sharedCheckpoint = multi ? null : state.checkpoint;
  const documents: GmailFetchResult["documents"] = [];
  let unsupported = 0;
  let checkpoint = state.checkpoint ?? "";
  let failedAccounts = 0;
  let authFailure = false;
  let partial = false;
  for (const account of accounts) {
    try {
      const result = await deps.fetchCandidates(account, sharedCheckpoint, rescan, query);
      documents.push(...result.documents.slice(0, MAX_GMAIL_CANDIDATES));
      unsupported += result.unsupported;
      checkpoint = result.checkpoint;
      if (result.partial) partial = true;
    } catch (error) {
      failedAccounts += 1;
      if (error instanceof Error && error.message === "gmail_authorization_required") authFailure = true;
    }
  }
  if (failedAccounts === accounts.length) {
    return deny(
      authFailure ? "gmail_authorization_required" : "gmail_unavailable",
      "CanX Gmail could not be read. Re-authorize the CanX Gmail connection, then try again. Nothing was filed.",
    );
  }
  // Never advance the checkpoint after a partial failure, so a retry still
  // sees everything the failed mailbox missed. A capped page also keeps it.
  const nextCheckpoint = failedAccounts > 0 || partial ? (state.checkpoint ?? "") : checkpoint || String(Date.now());

  const parsed: IngestibleReceipt[] = [];
  const evidence: SubscriptionEvidence[] = [];
  const perMessage = new Map<string, { index: number; pdf: boolean }>();
  const seenFingerprints = new Set<string>();
  let malformed = unsupported;
  let sentToReview = 0;
  let notFiledPersonal = 0;
  for (const document of documents.slice(0, MAX_GMAIL_CANDIDATES * accounts.length)) {
    const kind = classifyDocument(document.text, document.subject ?? "");
    const match = matchService(document.from ?? "", `${document.subject ?? ""}\n${document.text}`, subscriptions);
    const result = parseReceiptCandidate(document);
    if (kind === "unknown" && !result.ok) {
      malformed += 1;
      continue;
    }
    if (match.status === "matched" || kind === "renewal-notice" || kind === "price-change" || match.status === "personal") {
      evidence.push(toEvidence(document, kind, match, result.receipt));
    }
    if (kind === "renewal-notice" || kind === "price-change") continue; // notices are not receipts
    if (match.status === "personal") {
      notFiledPersonal += 1; // John marked this service personal: never filed as an office expense
      continue;
    }
    if (!result.ok || !result.receipt) {
      malformed += 1;
      continue;
    }
    const fp = result.receipt.contentFingerprint;
    if (seenFingerprints.has(fp)) continue; // same document in both mailboxes
    seenFingerprints.add(fp);
    if (match.status !== "matched") sentToReview += 1;
    const enriched = {
      ...result.receipt,
      documentType: kind === "unpaid-invoice" ? "invoice" : result.receipt.documentType,
      paymentStatus: kind === "unpaid-invoice" ? "unknown" : result.receipt.paymentStatus,
      invoicePaymentState: kind === "unpaid-invoice" ? "unpaid-stated" : result.receipt.paymentStatus === "paid" ? "paid-stated" : "not-stated",
      evidenceKind: kind,
      serviceMatchStatus: match.status,
      matchedSubscriptionId: match.subscriptionId,
      officeExpenseStatus: match.status === "matched" ? "matched-office-service-needs-review" : "unconfirmed-needs-review",
      gmailFrom: document.from ?? "",
      gmailSubject: document.subject ?? "",
    } as IngestibleReceipt;
    // Body text and attachment of one message describing the same charge: keep one, prefer the PDF.
    const key = `${document.messageId}|${enriched.total}|${enriched.currency ?? ""}`;
    const pdf = document.mimeType === "application/pdf";
    const prior = perMessage.get(key);
    if (prior) {
      if (pdf && !prior.pdf) {
        parsed[prior.index] = enriched;
        perMessage.set(key, { index: prior.index, pdf });
      }
      continue;
    }
    perMessage.set(key, { index: parsed.length, pdf });
    parsed.push(enriched);
  }
  const written = await deps.atomicWrite(input.accessToken, owner.userId, parsed, nextCheckpoint);
  if (!written.ok) return deny("write_unverified", "The Finance write could not be verified, so no receipt is reported as filed. Check the CanX database and retry.");

  let evidenceAdded = 0;
  let evidenceDuplicates = 0;
  let evidenceNote = "";
  const freshEvidence = mergeEvidence(state.evidence ?? [], evidence);
  evidenceDuplicates = freshEvidence.duplicates;
  if (freshEvidence.added.length > 0) {
    if (!deps.writeEvidence) {
      evidenceNote = " Subscription evidence was found but could not be saved in this environment.";
    } else {
      const saved = await deps.writeEvidence(input.accessToken, owner.userId, freshEvidence.added);
      if (saved.ok) {
        evidenceAdded = saved.added;
        evidenceDuplicates += saved.duplicates;
      } else {
        evidenceNote = " Subscription evidence could not be saved and verified; it is not reported as recorded.";
      }
    }
  }

  const summary = safeIngestionSummary(written.allReceipts, written.filed, written.duplicates, malformed + written.filed.length);
  const partialNote =
    failedAccounts > 0
      ? ` ${failedAccounts} linked mailbox${failedAccounts === 1 ? "" : "es"} could not be read this time; re-authorize it and run again to include it.`
      : "";
  const capNote = partial
    ? ` Partial check: Gmail had more matching mail than the ${MAX_GMAIL_CANDIDATES} per mailbox read this time, so not all mail was checked.`
    : "";
  return {
    ok: true,
    code: "ok",
    message: `Receipt review finished: ${summary.filed} new filed, ${summary.duplicatesSkipped} duplicates skipped, ${summary.needsReview} needing review. Subscription evidence: ${evidenceAdded} new, ${evidenceDuplicates} already recorded. ${sentToReview} filed item(s) did not match a known office service and are marked for review, not as office expenses.${partialNote}${capNote}${evidenceNote}`,
    ...summary,
    partial,
    mailboxesChecked: accounts.length - failedAccounts,
    mailboxesFailed: failedAccounts,
    subscriptionEvidenceAdded: evidenceAdded,
    subscriptionEvidenceDuplicates: evidenceDuplicates,
    sentToReview,
    notFiledPersonal,
  };
}

const RENEWAL_DATE = /\b(?:renews?\s+on|renewal\s+date|next\s+(?:billing|renewal|payment)\s+date|will\s+renew\s+on|effective)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i;
const CODED_AMOUNT = /\b(CAD|USD|EUR|GBP)\s?\$?\s?([0-9][0-9,]*(?:\.[0-9]{2})?)\b/;

function toEvidence(
  document: GmailFetchResult["documents"][number],
  kind: EvidenceKind,
  match: { status: MatchStatus; subscriptionId: string | null; candidateIds: string[] },
  receipt: IngestibleReceipt | undefined,
): SubscriptionEvidence {
  const coded = CODED_AMOUNT.exec(document.text);
  const amount = kind === "price-change" && coded ? Number(coded[2]!.replace(/,/g, "")) : (receipt?.total ?? (coded ? Number(coded[2]!.replace(/,/g, "")) : null));
  const currency = receipt?.currency ?? (coded ? coded[1]! : null);
  const renewal = RENEWAL_DATE.exec(document.text)?.[1] ?? receipt?.expectedRenewalDate ?? "";
  const valid = renewal && !Number.isNaN(Date.parse(`${renewal}T00:00:00Z`)) ? renewal : "";
  const fingerprint = receipt?.contentFingerprint ?? fingerprintText(document.text);
  return {
    id: `ev-${fingerprint.slice(0, 24)}`,
    kind,
    matchStatus: match.status,
    subscriptionId: match.subscriptionId,
    candidateIds: match.candidateIds,
    vendor: receipt?.vendor ?? (document.from ?? "").replace(/<.*>/, "").trim().slice(0, 120),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency,
    documentDate: receipt?.date ?? "",
    renewalDate: valid,
    renewalBasis: valid ? "explicit" : "",
    mailbox: document.mailbox ?? "",
    messageId: document.messageId,
    attachmentIdentity: document.attachmentIdentity,
    from: (document.from ?? "").slice(0, 300),
    subject: (document.subject ?? "").slice(0, 300),
    fingerprint,
    recordedAt: new Date().toISOString(),
    review: "needs-review",
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
