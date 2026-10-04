import { financeReadMessage } from "./finance-read-diagnosis";
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
  cleanGmailScanConfig,
  datedGmailQuery,
  DEFAULT_GMAIL_SCAN_FROM_DATE,
  validScanDate,
  type GmailScanConfig,
} from "./gmail-scan-window";
import {
  buildGmailQuery,
  classifyBillingContext,
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
const NORMAL_EMAIL_CHECK = /^(?:(?:elsie|astra|data)[, :]*)?(?:please\s+)?(?:(?:can|would)\s+you\s+)?check\s+(?:(?:both|the)\s+mailboxes|(?:my|the)\s+emails?)\s*[?.!]*$/i;

export function isExplicitReceiptSyncRequest(message: string): boolean {
  // Only a short, dedicated command may bypass the general conversation.
  // Multi-step reviews mentioning receipts must reach Elsie in full.
  const command = message.trim();
  if (command.length > 240 || /[\r\n]/.test(command)) return false;
  if (/\b(?:do not|don’t|don't|never|without)\b/i.test(command)) return false;
  if (NORMAL_EMAIL_CHECK.test(command)) return true;
  return /^(?:(?:elsie|astra|data)[, :]*)?(?:please\s+)?(?:review|retrieve|check|find|sync|file|import|rescan)\b/i.test(command)
    && EXPLICIT_RECEIPT_SYNC_INTENT.test(command);
}

export function receiptSyncOutcome(result: ReceiptSyncResult): string {
  const scope = result.fromDate
    ? `Scope: ${result.fromDate} through the frozen run end, billing and renewal keywords plus known service senders, bounded verified pages — not the whole inbox.`
    : "Scope: billing and renewal keywords plus known service senders, one bounded page per linked mailbox — not the whole inbox.";
  const status = !result.ok ? "Stopped — the check failed." : result.partial || result.mailboxesFailed ? "Partial — not all matching mail was checked." : "Finished — complete within this check's scope.";
  const mailboxes = (result.mailboxes ?? []).map((m) => `${m.mailbox}: ${m.status === "read" ? `${m.documents} matching item(s) read${m.partial ? " — partial" : ""}` : m.status === "authorization_required" ? "access refused — re-authorise" : "could not be read"}.`);
  return [status, scope, result.message, ...mailboxes].join("\n");
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
  /** Messages skipped by John's saved Ignore choices (not failures, not filed). */
  ignoredByPreference?: number;
  /** Per-mailbox outcome of this run (address, status, capped, items read). */
  mailboxes?: MailboxCheck[];
  fromDate?: string;
  endAt?: string;
  scanStatus?: "paused" | "complete" | "failed";
  hasMore?: boolean;
  /** Safe to request the next page immediately; false on any fetch/content cap failure. */
  canContinueNow?: boolean;
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
    /** John's saved Keep/Ignore choices (owner-only Finance doc). */
    mailPreferences?: import("./mail-preferences").MailPreferences;
    scanConfig?: GmailScanConfig | null;
    /** Safe classified reason when ok is false. */
    failure?: import("./finance-read-diagnosis").FinanceReadFailure;
  }>;
  fetchCandidates: (settings: GmailSettings, checkpoint: string | null, rescan: boolean, query?: string, pageTokens?: Record<string, string>, preferences?: import("./mail-preferences").MailPreferences | null) => Promise<GmailFetchResult>;
  /** Saves the per-mailbox continuation (compare-and-swap). Absent = first-page-only. */
  saveContinuation?: (token: string, ownerId: string, next: GmailContinuation) => Promise<boolean>;
  saveScanProgress?: (token: string, ownerId: string, next: GmailContinuation, scan: GmailScanConfig) => Promise<boolean>;
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
      const diag = await import("./finance-read-diagnosis");
      if (!config) return { ok: false, checkpoint: null, receipts: [], failure: "backend_not_configured" };
      const response = await backend.restRequest(config, token, "finance_receipts?select=doc,gmail_sync_checkpoint,ingested_receipts&limit=1");
      if (!response.ok) {
        const failure = diag.classifyFinanceRead(response.status || 0, response.body);
        console.error("[receipt-sync] finance read failed", response.status, failure);
        return { ok: false, checkpoint: null, receipts: [], failure };
      }
      const row = Array.isArray(response.body) ? (response.body[0] as { doc?: { receipts?: unknown }; gmail_sync_checkpoint?: string; ingested_receipts?: unknown }) : null;
      const legacy = Array.isArray(row?.doc?.receipts) ? (row.doc.receipts as FinanceReceipt[]) : [];
      const ingested = Array.isArray(row?.ingested_receipts) ? (row.ingested_receipts as FinanceReceipt[]) : [];
      const subs = await import("./subscriptions");
       const doc = (row?.doc ?? {}) as { subscriptions?: unknown; subscriptionEvidence?: unknown; gmailContinuation?: unknown; mailPreferences?: unknown; gmailScanConfig?: unknown };
      const mp = await import("./mail-preferences");
      return {
        ok: true,
        checkpoint: row?.gmail_sync_checkpoint ?? null,
        receipts: [...legacy, ...ingested],
        subscriptions: subs.cleanSubscriptionList(doc.subscriptions ?? []) ?? [],
        evidence: subs.cleanEvidenceList(doc.subscriptionEvidence),
        continuation: cleanContinuation(doc.gmailContinuation),
        mailPreferences: mp.cleanMailPreferences(doc.mailPreferences),
         scanConfig: cleanGmailScanConfig(doc.gmailScanConfig),
      };
    },
    fetchCandidates: (settings, checkpoint, rescan, query, pageTokens, preferences) =>
      gmail.fetchGmailReceiptCandidates(settings, checkpoint, rescan, undefined, query, pageTokens, preferences ?? null),
    saveContinuation: async (token, ownerId, next) => {
      const store = await import("./subscriptions-store.server");
      return store.saveGmailContinuation(token, ownerId, next);
    },
    saveScanProgress: async (token, ownerId, next, scan) => {
      const store = await import("./subscriptions-store.server");
      return store.saveGmailScanProgress(token, ownerId, next, scan);
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
      const { ingestInBatches } = await import("./finance-ingest-batches");
      // The deployed RPC accepts at most 25 candidates per call: send sequential batches.
      return ingestInBatches(
        {
          rpc: async (candidates, cp) => {
            const response = await backend.restRequest(config, token, "rpc/ingest_finance_receipts", {
              method: "POST",
              body: JSON.stringify({ _owner_id: ownerId, _candidates: candidates, _checkpoint: cp }),
            });
            if (!response.ok || !response.body || typeof response.body !== "object") return { ok: false, filed: [], duplicates: 0 };
            const body = response.body as { filed?: unknown; duplicates_skipped?: unknown };
            return {
              ok: true,
              filed: Array.isArray(body.filed) ? (body.filed as IngestibleReceipt[]) : [],
              duplicates: typeof body.duplicates_skipped === "number" ? body.duplicates_skipped : 0,
            };
          },
          reread: async () => {
            const reread = await backend.restRequest(config, token, "finance_receipts?select=doc,ingested_receipts&limit=1");
            const row = reread.ok && Array.isArray(reread.body) ? (reread.body[0] as { doc?: { receipts?: unknown }; ingested_receipts?: unknown }) : null;
            const legacy = Array.isArray(row?.doc?.receipts) ? (row.doc.receipts as FinanceReceipt[]) : [];
            const ingested = Array.isArray(row?.ingested_receipts) ? (row.ingested_receipts as FinanceReceipt[]) : [];
            return { ok: reread.ok, ingested, all: [...legacy, ...ingested] };
          },
        },
        receipts,
        checkpoint,
      );
    },
  };
}

export async function runReceiptSync(input: { accessToken: string; request: string; fromDate?: string }) {
  return runReceiptSyncWith(await realDeps(), input);
}

export async function runReceiptSyncWith(
  deps: SyncDeps,
  input: { accessToken: string; request: string; fromDate?: string },
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
  if (!state.ok) return deny("database_unavailable", financeReadMessage(state.failure ?? "unexpected_response"));
  const subscriptions = state.subscriptions ?? [];
  const datedMode = Boolean(input.fromDate || state.scanConfig || deps.saveScanProgress);
  const fromDate = input.fromDate || state.scanConfig?.fromDate || DEFAULT_GMAIL_SCAN_FROM_DATE;
  if (datedMode && !validScanDate(fromDate)) return deny("invalid_request", "Enter a valid From date in YYYY-MM-DD format.");
  const requestedStart = new Date(`${fromDate}T00:00:00Z`);
  if (datedMode && requestedStart.getTime() > Date.now() + 86_400_000) return deny("invalid_request", "The From date cannot be in the future.");
  const priorScan = state.scanConfig;
  const continuing = datedMode && priorScan?.fromDate === fromDate && priorScan.status === "paused";
  const endAt = continuing ? priorScan.endAt : new Date().toISOString();
  const query = datedMode ? datedGmailQuery(buildGmailQuery(subscriptions), fromDate, endAt) : buildGmailQuery(subscriptions);
  if (!query) return deny("invalid_request", "The From date could not be used, so no email was checked.");

  const rescan = RESCAN_INTENT.test(input.request);
  // One shared Finance checkpoint cannot describe several mailboxes: a newly
  // linked or previously failed mailbox would skip older receipts. With more
  // than one mailbox, search the full past-year window (25 per mailbox) and
  // rely on fingerprint dedup instead of a date checkpoint.
  const multi = accounts.length > 1;
  const sharedCheckpoint = datedMode || multi ? null : state.checkpoint;
  const documents: GmailFetchResult["documents"] = [];
  let unsupported = 0;
  let checkpoint = state.checkpoint ?? "";
  let failedAccounts = 0;
  let authFailure = false;
  let partial = false;
  const checks: MailboxCheck[] = [];
  // Continuation is only valid for the identical Gmail query; a rescan starts at page 1.
  const queryKey = datedMode ? `dated|${fromDate}|${endAt}|${query}` : `${query}|${rescan ? "rescan" : sharedCheckpoint ?? ""}`;
  const priorContinuation = state.continuation ?? {};
  const pageTokens: Record<string, string> = {};
  if (!rescan && ((datedMode && deps.saveScanProgress && continuing && priorScan.queryKey === queryKey) || (!datedMode && deps.saveContinuation))) {
    for (const [mb, c] of Object.entries(priorContinuation)) if (c.query === queryKey) pageTokens[mb] = c.token;
  }
  const nextContinuation: GmailContinuation = { ...priorContinuation };
  let continuedAny = false;
  let rejectedAny = false;
  let unprocessed = 0; // transient fetch failures (messages/attachments) — page repeats
  let needsReviewDocs = 0; // supported but unreadable documents (images/OCR, oversized)
  let capHit = false;
  let ignoredByPreference = 0;
  let canContinueNow = true;
  const completedSlots = new Set(continuing && priorScan.queryKey === queryKey ? priorScan.completedSlots : []);
  const checkBySlot = new Map<number, MailboxCheck>((continuing && priorScan.queryKey === queryKey ? priorScan.mailboxes : []).flatMap((check) => typeof check.slot === "number" ? [[check.slot, check]] : []));
  for (const [slot, account] of accounts.entries()) {
    if (completedSlots.has(slot)) continue;
    try {
      const result = await deps.fetchCandidates(account, sharedCheckpoint, rescan, query, pageTokens, state.mailPreferences ?? null);
      ignoredByPreference += result.ignored ?? 0;
      const mb = (result.mailbox || "").toLowerCase();
      if (result.continued) continuedAny = true;
      if (result.continuationRejected) rejectedAny = true;
      unprocessed += result.fetchFailures ?? 0;
      needsReviewDocs += result.needsReview ?? 0;
      if (result.documentCapHit) capHit = true;
      if ((result.fetchFailures ?? 0) > 0 || result.documentCapHit) canContinueNow = false;
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
      if (!result.nextPageToken && !(result.fetchFailures ?? 0) && !result.documentCapHit) completedSlots.add(slot);
      const checked = { slot, mailbox: result.mailbox || result.documents[0]?.mailbox || `Linked mailbox ${slot + 1}`, status: "read" as const, partial: mbPartial, documents: result.documents.length, hasMore: Boolean(result.nextPageToken) };
      checks.push(checked);
      checkBySlot.set(slot, checked);
      if (datedMode && ((result.fetchFailures ?? 0) > 0 || result.documentCapHit)) {
        for (let remaining = slot + 1; remaining < accounts.length; remaining += 1) {
          const stopped = { slot: remaining, mailbox: `Linked mailbox ${remaining + 1}`, status: "failed" as const, partial: true, documents: 0 };
          checks.push(stopped);
          checkBySlot.set(remaining, stopped);
          failedAccounts += 1;
        }
        break;
      }
    } catch (error) {
      canContinueNow = false;
      failedAccounts += 1;
      const auth = error instanceof Error && error.message === "gmail_authorization_required";
      if (auth) authFailure = true;
      const checked = { slot, mailbox: `Linked mailbox ${slot + 1}`, status: auth ? "authorization_required" as const : "failed" as const, partial: true, documents: 0 };
      checks.push(checked);
      checkBySlot.set(slot, checked);
      if (datedMode) {
        for (let remaining = slot + 1; remaining < accounts.length; remaining += 1) {
          const stopped = { slot: remaining, mailbox: `Linked mailbox ${remaining + 1}`, status: "failed" as const, partial: true, documents: 0 };
          checks.push(stopped);
          checkBySlot.set(remaining, stopped);
          failedAccounts += 1;
        }
        break;
      }
    }
  }
  const scope = datedMode
    ? `${fromDate} through ${endAt} (frozen for this run), one page of up to ${MAX_GMAIL_CANDIDATES} matching messages per unfinished mailbox per step${deps.saveScanProgress ? "; verified pages resume safely" : " (first page only — no saved continuation)"}${continuedAny ? "; resumed from saved positions" : ""}; billing/renewal keywords and known service senders only — not the whole inbox.`
    : `Past year, one page of up to ${MAX_GMAIL_CANDIDATES} matching messages per mailbox per check (all readable bodies and attachments in those messages)${deps.saveContinuation ? "; later checks continue to older pages" : " (first page only — no continuation)"}${continuedAny ? "; this check continued from an earlier one, so newer mail may need a fresh check" : ""}; billing/renewal keywords and known service senders only — not the whole inbox.`;
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
    if (deps.saveScanProgress) {
      const failedScan: GmailScanConfig = { fromDate, endAt, queryKey, completedSlots: [...completedSlots], status: "failed", savedAt: new Date().toISOString(), mailboxes: [...checkBySlot.values()] };
      await deps.saveScanProgress(input.accessToken, owner.userId, priorContinuation, failedScan).catch(() => false);
    }
    await finishCheck(false);
    return {
      ...deny(
        authFailure ? "gmail_authorization_required" : "gmail_unavailable",
        "CanX Gmail could not be read. Re-authorize the CanX Gmail connection, then try again. Nothing was filed.",
      ),
      partial: true,
      mailboxesChecked: 0,
      mailboxesFailed: failedAccounts,
      mailboxes: checks,
    };
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
    const classification = classifyBillingContext(document.text, document.subject ?? "", document.receivedAt);
    const kind = classification.kind;
    const match = matchService(document.from ?? "", `${document.subject ?? ""}\n${document.text}`, subscriptions);
    const result = parseReceiptCandidate(document);
    if (kind === "unknown" && !result.ok) {
      malformed += 1;
      continue;
    }
    // Alias-only mentions of a service with no verified sender are filed as
    // review evidence only when they look like billing; promotions are skipped.
    if (match.status === "unverified-sender" && kind !== "unknown") evidence.push(toEvidence(document, classification, match, result.receipt));
    else if (match.status === "matched" || kind === "renewal-notice" || kind === "deadline-notice" || kind === "promotion" || kind === "price-change" || kind === "failed-payment" || match.status === "personal") {
      evidence.push(toEvidence(document, classification, match, result.receipt));
    }
    if (kind === "renewal-notice" || kind === "deadline-notice" || kind === "promotion" || kind === "price-change" || kind === "failed-payment") continue; // notices are not receipts
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
      receivedAt: document.receivedAt ?? "",
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
  // Receipts are written with the EXISTING checkpoint; it only advances after every
  // batch, evidence and continuation write is verified (see end of this function).
  const priorCheckpoint = state.checkpoint ?? "";
  const written = await deps.atomicWrite(input.accessToken, owner.userId, parsed, priorCheckpoint);
  if (!written.ok) {
    await finishCheck(false);
    if (written.filed.length > 0) {
      return {
        ...deny("write_unverified", `Partial Finance write: ${written.filed.length} receipt(s) were saved and confirmed, but the rest could not be saved or verified. The mailbox position and checkpoint were not advanced, so the next check repeats this page (already-saved receipts are skipped as duplicates).`),
        filed: written.filed.length,
        partial: true,
      } as ReceiptSyncResult;
    }
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
  const hasMore = completedSlots.size < accounts.length;
  let continuationOk = datedMode ? !deps.saveScanProgress : !deps.saveContinuation;
  if (datedMode && deps.saveScanProgress && !evidenceNote) {
    const scan: GmailScanConfig = { fromDate, endAt, queryKey, completedSlots: [...completedSlots], status: hasMore ? "paused" : "complete", savedAt: new Date().toISOString(), mailboxes: [...checkBySlot.values()] };
    const savedPos = await deps.saveScanProgress(input.accessToken, owner.userId, nextContinuation, scan).catch(() => false);
    continuationOk = savedPos;
    if (!savedPos) continuationNote = " The position for older mail could not be saved, so the next check will repeat this page.";
  } else if (datedMode && deps.saveScanProgress && evidenceNote) {
    continuationNote = " Because evidence was not saved, the next check will repeat this page.";
  } else if (!datedMode && deps.saveContinuation && !evidenceNote) {
    const savedPos = await deps.saveContinuation(input.accessToken, owner.userId, nextContinuation).catch(() => false);
    continuationOk = savedPos;
    if (!savedPos) continuationNote = " The position for older mail could not be saved, so the next check will repeat this page.";
  } else if (!datedMode && deps.saveContinuation && evidenceNote) {
    continuationNote = " Because evidence was not saved, the next check will repeat this page.";
  }
  if (hasMore && Object.keys(nextContinuation).length > 0) continuationNote += datedMode ? " More matching mail remains in this dated scan." : " Run the check again to continue with older matching mail.";
  if (rejectedAny) continuationNote += " A saved position had expired, so the first page was read again.";
  let writesVerified = !evidenceNote && continuationOk;
  let checkpointNote = "";
  if (writesVerified && nextCheckpoint !== priorCheckpoint) {
    // Checkpoint-only call (no candidates) once everything else verified.
    const adv = await deps.atomicWrite(input.accessToken, owner.userId, [], nextCheckpoint).catch(() => ({ ok: false }));
    if (!adv.ok) { writesVerified = false; checkpointNote = " The sync checkpoint could not be advanced; the next check repeats this window."; }
  }
  const { saved: lastCheckSaved } = await finishCheck(writesVerified);
  const finalPartial = partial || !writesVerified;
  const checkNote = deps.recordLastCheck && !lastCheckSaved ? " The last-check time could not be saved." : "";
  const capNote = partial
    ? ` Partial check: not all mail was checked this time (more matching mail remains${unprocessed ? `, ${unprocessed} message or attachment fetch(es) failed and will be retried` : ""}${capHit ? ", the per-check document limit was reached" : ""}).`
    : "";
  const reviewNote = needsReviewDocs > 0
    ? ` ${needsReviewDocs} attachment(s) (for example image receipts) could not be read automatically and need your review in the original email.`
    : "";
  const ignoreNote = ignoredByPreference > 0 ? ` ${ignoredByPreference} email(s) were skipped because of your saved Ignore choices (not read, not filed).` : "";
  return {
    ok: true,
    code: "ok",
    message: `Receipt review finished: ${summary.filed} new Finance receipt row(s) filed, ${summary.duplicatesSkipped} duplicates skipped. Review items: ${summary.needsReview} (${written.filed.length} verified Finance receipt row(s) needing review; ${malformed} email document(s) not filed as Finance receipts).${ignoreNote} Subscription evidence: ${evidenceAdded} new, ${evidenceDuplicates} already recorded. ${sentToReview} filed item(s) did not match a known office service and are marked for review, not as office expenses.${partialNote}${capNote}${reviewNote}${evidenceNote}${continuationNote}${checkpointNote}${checkNote}`,
    ...summary,
    partial: finalPartial,
    mailboxesChecked: accounts.length - failedAccounts,
    mailboxesFailed: failedAccounts,
    subscriptionEvidenceAdded: evidenceAdded,
    subscriptionEvidenceDuplicates: evidenceDuplicates,
    sentToReview,
    notFiledPersonal,
    ignoredByPreference,
    mailboxes: [...checkBySlot.values()],
    ...(datedMode ? { fromDate, endAt, scanStatus: finalPartial || hasMore ? "paused" as const : "complete" as const, hasMore, canContinueNow: hasMore && canContinueNow && failedAccounts === 0 } : {}),
  };
}

const RENEWAL_DATE = /\b(?:renews?\s+on|renewal\s+date|next\s+(?:billing|renewal|payment)\s+date|will\s+renew\s+on|effective)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i;
const CODED_AMOUNT = /\b(CAD|USD|EUR|GBP)\s?\$?\s?([0-9][0-9,]*(?:\.[0-9]{2})?)\b/;

function toEvidence(
  document: GmailFetchResult["documents"][number],
  classification: ReturnType<typeof classifyBillingContext>,
  match: { status: MatchStatus; subscriptionId: string | null; candidateIds: string[] },
  receipt: IngestibleReceipt | undefined,
): SubscriptionEvidence {
  const kind = classification.kind;
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
    classificationReason: classification.reason.slice(0, 300),
    deadlineWhat: classification.deadlineWhat,
    deadlineDate: classification.deadlineDate,
    ...(classification.deadlineBasis ? { deadlineBasis: classification.deadlineBasis } : {}),
    classificationAmbiguous: classification.ambiguous,
  };
}

function validate(input: unknown) {
  const row = input as { accessToken?: unknown; request?: unknown; fromDate?: unknown } | undefined;
  return {
    accessToken: typeof row?.accessToken === "string" ? row.accessToken.slice(0, 4_000) : "",
    request: typeof row?.request === "string" ? row.request.slice(0, 2_000) : "",
    ...(typeof row?.fromDate === "string" ? { fromDate: row.fromDate.slice(0, 10) } : {}),
  };
}

export const syncGmailReceipts = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => runReceiptSync(data));
