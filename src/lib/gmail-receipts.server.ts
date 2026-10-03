import { extractText, getDocumentProxy } from "unpdf";
import {
  GMAIL_QUERY,
  MAX_ATTACHMENT_BYTES,
  MAX_DOCUMENT_TEXT,
  MAX_GMAIL_CANDIDATES,
  type CandidateDocument,
} from "./receipt-ingestion";
import { hasIgnoreSenderRules, shouldSkipMessage, type MailPreferences } from "./mail-preferences";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const TIMEOUT_MS = 20_000;

export interface GmailSettings {
  lovableApiKey: string;
  connectionApiKey: string;
}

const MAX_LINKED_MAILBOXES = 5;

/**
 * One entry per Gmail connection linked to this project. Lovable names the
 * first key GOOGLE_MAIL_API_KEY and each additional one GOOGLE_MAIL_API_KEY_1,
 * _2, and so on (Lovable's actual numbering). Only keys that actually exist are
 * returned; none are invented.
 */
export function readGmailAccounts(): GmailSettings[] {
  const lovableApiKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!lovableApiKey) return [];
  const accounts: GmailSettings[] = [];
  for (let index = 0; index <= MAX_LINKED_MAILBOXES; index++) {
    const envName = index === 0 ? "GOOGLE_MAIL_API_KEY" : `GOOGLE_MAIL_API_KEY_${index}`;
    const connectionApiKey = process.env[envName]?.trim();
    if (connectionApiKey) accounts.push({ lovableApiKey, connectionApiKey });
  }
  return accounts;
}

export function readGmailSettings(): GmailSettings | null {
  return readGmailAccounts()[0] ?? null;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

async function gateway(settings: GmailSettings, path: string, fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(`${GATEWAY}${path}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${settings.lovableApiKey}`,
        "X-Connection-Api-Key": settings.connectionApiKey,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

function flatten(part: GmailPart): GmailPart[] {
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}

export async function textFromAttachment(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("attachment_too_large");
  if (mimeType === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 30) throw new Error("pdf_page_limit");
    const result = await extractText(pdf, { mergePages: true });
    return String(result.text).slice(0, MAX_DOCUMENT_TEXT);
  }
  if (mimeType.startsWith("text/")) return new TextDecoder().decode(bytes).slice(0, MAX_DOCUMENT_TEXT);
  if (mimeType.startsWith("image/")) return ""; // Images are supported as bounded candidates but never guessed without verified OCR.
  return "";
}

export interface GmailFetchResult {
  documents: CandidateDocument[];
  checkpoint: string;
  unsupported: number;
  /** True when Gmail reported more matches than this capped page fetched. */
  partial?: boolean;
  /** Verified mailbox address from the profile check. */
  mailbox?: string;
  /** Gmail continuation token for the next page of the same query (if any). */
  nextPageToken?: string;
  /** True when this run started from a saved continuation rather than page 1. */
  continued?: boolean;
  /** True when the saved continuation was rejected and page 1 was read instead. */
  continuationRejected?: boolean;
  /** Messages or attachments on this page that could not be fetched (unprocessed; page must repeat). */
  fetchFailures?: number;
  /** Supported documents that could not be read (image/OCR, oversized, unreadable) — need John's review. */
  needsReview?: number;
  /** True when the per-page document cap stopped processing; page position must not advance. */
  documentCapHit?: boolean;
  /** Messages skipped because of John's saved Ignore choices (not failures, not filed). */
  ignored?: number;
}

/** Safety bound on documents (bodies + attachments) read from one page of messages. */
export const MAX_DOCUMENTS_PER_PAGE = 200;

export async function fetchGmailReceiptCandidates(
  settings: GmailSettings,
  checkpoint: string | null,
  rescan: boolean,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  baseQuery: string = GMAIL_QUERY,
  pageTokens: Record<string, string> = {},
  preferences: MailPreferences | null = null,
): Promise<GmailFetchResult> {
  // Read-only profile check: verifies which mailbox this connection is and
  // labels every document with it, so receipts keep their source provenance.
  const profile = await gateway(settings, "/users/me/profile", fetchImpl);
  if (!profile.ok) throw new Error(profile.status === 401 || profile.status === 403 ? "gmail_authorization_required" : "gmail_unavailable");
  const mailbox = String(((await profile.json()) as { emailAddress?: unknown }).emailAddress ?? "");

  const query = encodeURIComponent(rescan || !checkpoint ? baseQuery : `${baseQuery} after:${checkpoint}`);
  const saved = pageTokens[mailbox.toLowerCase()];
  let continued = false;
  let continuationRejected = false;
  let list = await gateway(settings, `/users/me/messages?maxResults=${MAX_GMAIL_CANDIDATES}&q=${query}${saved ? `&pageToken=${encodeURIComponent(saved)}` : ""}`, fetchImpl);
  if (saved && list.status === 400) {
    // Expired/invalid token: honestly fall back to page 1.
    continuationRejected = true;
    list = await gateway(settings, `/users/me/messages?maxResults=${MAX_GMAIL_CANDIDATES}&q=${query}`, fetchImpl);
  } else if (saved && list.ok) continued = true;
  if (!list.ok) throw new Error(list.status === 401 || list.status === 403 ? "gmail_authorization_required" : "gmail_unavailable");
  const listed = (await list.json()) as { messages?: Array<{ id?: string }>; nextPageToken?: string; resultSizeEstimate?: number };
  const ids = (listed.messages ?? []).map((row) => row.id).filter((id): id is string => Boolean(id)).slice(0, MAX_GMAIL_CANDIDATES);
  const documents: CandidateDocument[] = [];
  let unsupported = 0;
  let fetchFailures = 0;
  let needsReview = 0;
  let documentCapHit = false;
  let ignored = 0;
  const senderRules = preferences ? hasIgnoreSenderRules(preferences) : false;

  for (const messageId of ids) {
    if (documentCapHit) break;
    // John's saved choices are applied before any body or attachment is read.
    if (preferences && shouldSkipMessage(preferences, mailbox, messageId, null)) {
      ignored += 1;
      continue;
    }
    if (preferences && senderRules) {
      const meta = await gateway(settings, `/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=From`, fetchImpl);
      if (!meta.ok) {
        unsupported += 1;
        fetchFailures += 1; // unprocessed: page position is kept
        continue;
      }
      const m = (await meta.json()) as { payload?: { headers?: Array<{ name?: string; value?: string }> } };
      const fromHeader = String(m.payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === "from")?.value ?? "");
      if (shouldSkipMessage(preferences, mailbox, messageId, fromHeader)) {
        ignored += 1;
        continue;
      }
    }
    const response = await gateway(settings, `/users/me/messages/${encodeURIComponent(messageId)}?format=full`, fetchImpl);
    if (!response.ok) {
      unsupported += 1;
      fetchFailures += 1;
      continue;
    }
    const message = (await response.json()) as { internalDate?: string; payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> } };
    const header = (name: string) =>
      String(message.payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === name)?.value ?? "").slice(0, 300);
    const from = header("from");
    const subject = header("subject");
    // Gmail's own received time (ms since epoch). Kept only when valid.
    const ms = Number(message.internalDate);
    const receivedAt = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "";
    for (const part of flatten(message.payload ?? {})) {
      const mimeType = part.mimeType ?? "";
      const filename = (part.filename ?? "").slice(0, 240);
      if (!(mimeType.startsWith("text/") || mimeType === "application/pdf" || mimeType.startsWith("image/"))) continue;
      if (documents.length >= MAX_DOCUMENTS_PER_PAGE) {
        // Resource cap: stop and keep this page position so nothing is skipped.
        documentCapHit = true;
        break;
      }
      let bytes: Uint8Array | null = part.body?.data ? decodeBase64Url(part.body.data) : null;
      const attachmentId = part.body?.attachmentId;
      if (!bytes && attachmentId) {
        const attachment = await gateway(
          settings,
          `/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
          fetchImpl,
        );
        if (!attachment.ok) {
          // Transient fetch failure: unprocessed, page must be repeated.
          fetchFailures += 1;
          continue;
        }
        const payload = (await attachment.json()) as { data?: string; size?: number };
        if ((payload.size ?? 0) > MAX_ATTACHMENT_BYTES || !payload.data) {
          unsupported += 1;
          needsReview += 1;
          continue;
        }
        bytes = decodeBase64Url(payload.data);
      }
      if (!bytes) continue;
      try {
        const text = await textFromAttachment(bytes, mimeType);
        if (!text) {
          unsupported += 1;
          needsReview += 1; // e.g. image receipt with no text reader: John must look at it
          continue;
        }
        documents.push({
          messageId,
          attachmentIdentity: attachmentId || part.partId || "body",
          filename,
          mimeType,
          text,
          mailbox,
          from,
          subject,
          ...(receivedAt ? { receivedAt } : {}),
        });
      } catch {
        unsupported += 1;
        needsReview += 1;
      }
    }
  }

  const partial = documentCapHit || Boolean(listed.nextPageToken) || (!continued && (listed.resultSizeEstimate ?? 0) > ids.length);
  return {
    documents, checkpoint: String(Date.now()), unsupported, partial, mailbox,
    ...(listed.nextPageToken ? { nextPageToken: listed.nextPageToken } : {}), continued, continuationRejected, fetchFailures,
    needsReview, documentCapHit, ignored,
  };
}

export type MailboxAccessStatus = "verified" | "authorization_required" | "unavailable";
export interface MailboxAccessCheck { slot: number; email: string | null; status: MailboxAccessStatus }

/** Read-only profile check: returns only the address and status, never credentials or mail content. */
export async function checkGmailProfile(
  settings: GmailSettings,
  slot: number,
  fetchImpl: typeof fetch = fetch,
): Promise<MailboxAccessCheck> {
  try {
    const response = await gateway(settings, "/users/me/profile", fetchImpl);
    if (!response.ok) {
      return { slot, email: null, status: response.status === 401 || response.status === 403 ? "authorization_required" : "unavailable" };
    }
    const email = String(((await response.json()) as { emailAddress?: unknown }).emailAddress ?? "").trim();
    return email ? { slot, email, status: "verified" } : { slot, email: null, status: "unavailable" };
  } catch {
    return { slot, email: null, status: "unavailable" };
  }
}
