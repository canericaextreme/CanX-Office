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
  type LastCheck,
  type MailboxCheck,
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
  /** Per-mailbox outcome of this run (address, status, capped, items read). */
  mailboxes?: MailboxCheck[];
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

/** mailbox (lower-case) -> Gmail nextPageToken valid for exactly `query`. */
export type GmailContinuation = Record<string, { token: string; query: string; savedAt: string }>;

export function cleanContinuation(input: unknown): GmailContinuation {
  const out: GmailContinuation = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 10)) {
    const r = v as { token?: unknown; query?: unknown; savedAt?: unknown };
    if (typeof r?.token === "string" && typeof r.query === "string" && r.token.length < 500) {
      out[k.toLowerCase().slice(0, 200)] = { token: r.token, query: r.query.slice(0, 1400), savedAt: typeof r.savedAt === "string" ? r.savedAt : "" };
    }
  }
  return out;
}

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
    /** Per-mailbox Gmail continuation saved in the owner-only Finance doc. */
    continuation?: GmailContinuation;
  }>;
  fetchCandidates: (settings: GmailSettings, checkpoint: string | null, rescan: boolean, query?: string, pageTokens?: Record<string, string>) => Promise<GmailFetchResult>;
  /** Saves the per-mailbox continuation (compare-and-swap). Absent = first-page-only. */
  saveContinuation?: (token: string, ownerId: string, next: GmailContinuation) => Promise<boolean>;
  /** Appends subscription evidence to the owner's Finance document, verified by readback. */
  recordLastCheck?: (token: string, ownerId: string, check: LastCheck) => Promise<boolean>;
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
      const doc = (row?.doc ?? {}) as { subscriptions?: unknown; subscriptionEvidence?: unknown; gmailContinuation?: unknown };
      return {
        ok: true,
        checkpoint: row?.gmail_sync_checkpoint ?? null,
        receipts: [...legacy, ...ingested],
        subscriptions: subs.cleanSubscriptionList(doc.subscriptions ?? []) ?? [],
        evidence: subs.cleanEvidenceList(doc.subscriptionEvidence),
        continuation: cleanContinuation(doc.gmailContinuation),
      };
    },
    fetchCandidates: (settings, checkpoint, rescan, query, pageTokens) =>
      gmail.fetchGmailReceiptCandidates(settings, checkpoint, rescan, undefined, query, pageTokens),
    saveContinuation: async (token, ownerId, next) => {
      const store = await import("./subscriptions-store.server");
      return store.saveGmailContinuation(token, ownerId, next);
    },
    recordLastCheck: async (token, ownerId, check) => {
      const store = await import("./subscriptions-store.server");
      return store.recordLastCheck(token, ownerId, check);
    },
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
  const checks: MailboxCheck[] = [];
  // Continuation is only valid for the identical Gmail query; a rescan starts at page 1.
  const queryKey = `${query}|${rescan ? "rescan" : sharedCheckpoint ?? ""}`;
  const priorContinuation = state.continuation ?? {};
  const pageTokens: Record<string, string> = {};
  if (!rescan && deps.saveContinuation) {
    for (const [mb, c] of Object.entries(priorContinuation)) if (c.query === queryKey) pageTokens[mb] = c.token;
  }
  const nextContinuation: GmailContinuation = { ...priorContinuation };
  let continuedAny = false;
  let rejectedAny = false;
  let unprocessed = 0; // transient fetch failures (messages/attachments) — page repeats
  let needsReviewDocs = 0; // supported but unreadable documents (images/OCR, oversized)
  let capHit = false;
  for (const [slot, account] of accounts.entries()) {
    try {
      const result = await deps.fetchCandidates(account, sharedCheckpoint, rescan, query, pageTokens);
      const mb = (result.mailbox || "").toLowerCase();
      if (result.continued) continuedAny = true;
      if (result.continuationRejected) rejectedAny = true;
      unprocessed += result.fetchFailures ?? 0;
      needsReviewDocs += result.needsReview ?? 0;
      if (result.documentCapHit) capHit = true;
      // Advance only past a page whose every message and attachment was fetched and
      // every document was handled; otherwise keep the old position.
      if (mb && !(result.fetchFailures ?? 0) && !result.documentCapHit) {
        if (result.nextPageToken) nextContinuation[mb] = { token: result.nextPageToken, query: queryKey, savedAt: new Date().toISOString() };
        else delete nextContinuation[mb];
      }
      // Every supported document from the fetched messages is processed — no truncation.
      documents.push(...result.documents);
      unsupported += result.unsupported;
      checkpoint = result.checkpoint;
      const mbPartial = Boolean(result.partial) || Boolean(result.fetchFailures) || Boolean(result.needsReview) || Boolean(result.documentCapHit);
      if (mbPartial) partial = true;
      checks.push({ mailbox: result.mailbox || result.documents[0]?.mailbox || `Linked mailbox ${slot + 1}`, status: "read", partial: mbPartial, documents: result.documents.length });
    } catch (error) {
      failedAccounts += 1;
      const auth = error instanceof Error && error.message === "gmail_authorization_required";
      if (auth) authFailure = true;
      checks.push({ mailbox: `Linked mailbox ${slot + 1}`, status: auth ? "authorization_required" : "failed", partial: true, documents: 0 });
    }
  }
  const scope = `Past year, one page of up to ${MAX_GMAIL_CANDIDATES} matching messages per mailbox per check (all readable bodies and attachments in those messages)${deps.saveContinuation ? "; later checks continue to older pages" : " (first page only — no continuation)"}${continuedAny ? "; this check continued from an earlier one, so newer mail may need a fresh check" : ""}; billing/renewal keywords and known service senders only — not the whole inbox.`;
  // The last check is recorded only after every write has been attempted, and is
  // "complete" only when everything was fetched, handled and saved and verified.
  const finishCheck = async (writesVerified: boolean) => {
    const check: LastCheck = {
      at: new Date().toISOString(),
      scope,
      complete: writesVerified && failedAccounts === 0 && !partial,
      mailboxes: writesVerified ? checks : checks.map((c) => ({ ...c, partial: true })),
    };
    if (!deps.recordLastCheck) return { check, saved: false };
    const saved = await deps.recordLastCheck(input.accessToken, owner.userId, check).catch(() => false);
    return { check, saved };
  };
  if (failedAccounts === accounts.length) {
    await finishCheck(false);
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
  for (const document of documents) {
    const kind = classifyDocument(document.text, document.subject ?? "");
    const match = matchService(document.from ?? "", `${document.subject ?? ""}\n${document.text}`, subscriptions);
    const result = parseReceiptCandidate(document);
    if (kind === "unknown" && !result.ok) {
      malformed += 1;
      continue;
    }
    if (match.status === "matched" || kind === "renewal-notice" || kind === "price-change" || kind === "failed-payment" || match.status === "personal") {
      evidence.push(toEvidence(document, kind, match, result.receipt));
    }
    if (kind === "renewal-notice" || kind === "price-change" || kind === "failed-payment") continue; // notices are not receipts
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
  if (!written.ok) {
    await finishCheck(false);
    return deny("write_unverified", "The Finance write could not be verified, so no receipt is reported as filed. Check the CanX database and retry.");
  }

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
  let continuationNote = "";
  let continuationOk = !deps.saveContinuation; // nothing to save = no failure
  if (deps.saveContinuation && !evidenceNote) {
    const savedPos = await deps.saveContinuation(input.accessToken, owner.userId, nextContinuation).catch(() => false);
    continuationOk = savedPos;
    if (!savedPos) continuationNote = " The position for older mail could not be saved, so the next check will repeat this page.";
  } else if (deps.saveContinuation && evidenceNote) {
    continuationNote = " Because evidence was not saved, the next check will repeat this page.";
  }
  if (partial && Object.keys(nextContinuation).length > 0) continuationNote += " Run the check again to continue with older matching mail.";
  if (rejectedAny) continuationNote += " A saved position had expired, so the first page was read again.";
  const writesVerified = !evidenceNote && continuationOk;
  const { saved: lastCheckSaved } = await finishCheck(writesVerified);
  const finalPartial = partial || !writesVerified;
  const checkNote = deps.recordLastCheck && !lastCheckSaved ? " The last-check time could not be saved." : "";
  const capNote = partial
    ? ` Partial check: not all matching mail was checked this time (more pages remain${unprocessed ? `, ${unprocessed} message or attachment fetch(es) failed and will be retried` : ""}${capHit ? ", the per-check document limit was reached" : ""}).`
    : "";
  const reviewNote = needsReviewDocs > 0
    ? ` ${needsReviewDocs} attachment(s) (for example image receipts) could not be read automatically and need your review in the original email.`
    : "";
  return {
    ok: true,
    code: "ok",
    message: `Receipt review finished: ${summary.filed} new filed, ${summary.duplicatesSkipped} duplicates skipped, ${summary.needsReview} needing review. Subscription evidence: ${evidenceAdded} new, ${evidenceDuplicates} already recorded. ${sentToReview} filed item(s) did not match a known office service and are marked for review, not as office expenses.${partialNote}${capNote}${reviewNote}${evidenceNote}${continuationNote}${checkNote}`,
    ...summary,
    partial: finalPartial,
    mailboxesChecked: accounts.length - failedAccounts,
    mailboxesFailed: failedAccounts,
    subscriptionEvidenceAdded: evidenceAdded,
    subscriptionEvidenceDuplicates: evidenceDuplicates,
    sentToReview,
    notFiledPersonal,
    mailboxes: checks,
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
    ...(document.receivedAt ? { receivedAt: document.receivedAt } : {}),
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
