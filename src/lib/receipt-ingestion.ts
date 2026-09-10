import { createHash } from "node:crypto";
import {
  mergeReceipts,
  totalsByCurrency,
  type FinanceReceipt,
  type PaymentStatus,
} from "./finance-receipts";

export const MAX_GMAIL_CANDIDATES = 25;
export const MAX_ATTACHMENT_BYTES = 8_000_000;
export const MAX_DOCUMENT_TEXT = 40_000;
export const GMAIL_QUERY = "(receipt OR invoice) newer_than:1y -in:spam -in:trash";

export type DocumentType = "receipt" | "invoice" | "credit-note" | "unknown";
export type AccountantReviewStatus = "needs-owner-accountant-review" | "reviewed";

export interface ReceiptIngestionFields {
  documentType: DocumentType;
  invoiceNumber: string;
  transactionDate: string;
  issueDate: string;
  servicePeriod: string;
  gstHst: number | null;
  pst: number | null;
  combinedOtherTax: number | null;
  actualDueDate: string;
  recurring: boolean;
  recurringInterval: string;
  expectedRenewalDate: string;
  expectedRenewalBasis: string;
  suggestedCategory: string;
  accountantReviewStatus: AccountantReviewStatus;
  gmailMessageId: string;
  attachmentIdentity: string;
  contentFingerprint: string;
}

export type IngestibleReceipt = FinanceReceipt & ReceiptIngestionFields;

export interface CandidateDocument {
  messageId: string;
  attachmentIdentity: string;
  filename: string;
  mimeType: string;
  text: string;
}

export interface ParsedCandidate {
  ok: boolean;
  receipt?: IngestibleReceipt;
  reason?: string;
}

const clean = (value: string, max: number) =>
  value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

const amount = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
};

const first = (text: string, patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const hit = pattern.exec(text)?.[1];
    if (hit) return clean(hit, 160);
  }
  return "";
};

const isoDate = (value: string): string => {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

export function fingerprintText(value: string): string {
  return createHash("sha256").update(value.normalize("NFKC").replace(/\s+/g, " ").trim()).digest("hex");
}

export function parseReceiptCandidate(candidate: CandidateDocument): ParsedCandidate {
  const source = clean(candidate.text, MAX_DOCUMENT_TEXT);
  if (!source) return { ok: false, reason: "The document contained no supported readable text." };

  const vendor = first(source, [/\bvendor\s*[:#-]\s*([^|\n]{2,200})/i, /\bfrom\s*[:#-]\s*([^|\n]{2,200})/i]);
  const total = amount(first(source, [/\b(?:grand\s+)?total\s*[:$-]?\s*(?:CAD|USD|C\$|US\$|\$)?\s*([0-9][0-9,.]*)/i]));
  if (!vendor || total === null) return { ok: false, reason: "Vendor and total could not both be verified." };

  const explicitCurrency = first(source, [/\bcurrency\s*[:#-]\s*([A-Z]{3})\b/i, /\b(CAD|USD|EUR|GBP)\b/]);
  const currency = /^[A-Z]{3}$/.test(explicitCurrency.toUpperCase()) ? explicitCurrency.toUpperCase() : null;
  const invoiceNumber = first(source, [/\b(?:invoice|order)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{1,80})/i]);
  const issueDate = isoDate(first(source, [/\bissue\s+date\s*[:#-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/i]));
  const transactionDate = isoDate(first(source, [/\b(?:transaction|receipt)\s+date\s*[:#-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/i, /\bdate\s*[:#-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/i]));
  const actualDueDate = isoDate(first(source, [/\b(?:payment\s+)?due\s+date\s*[:#-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/i]));
  const expectedRenewalDate = isoDate(first(source, [/\b(?:next|expected)\s+renewal\s*[:#-]\s*(\d{4}[-/]\d{2}[-/]\d{2})/i]));
  const gstHst = amount(first(source, [/\b(?:GST\/HST|HST|GST)\s*[:$-]?\s*\$?([0-9][0-9,.]*)/i]));
  const pst = amount(first(source, [/\bPST\s*[:$-]?\s*\$?([0-9][0-9,.]*)/i]));
  const combinedOtherTax = amount(first(source, [/\b(?:combined|other|sales)\s+tax\s*[:$-]?\s*\$?([0-9][0-9,.]*)/i, /\btax\s*[:$-]?\s*\$?([0-9][0-9,.]*)/i]));
  const subtotal = amount(first(source, [/\bsubtotal\s*[:$-]?\s*\$?([0-9][0-9,.]*)/i]));
  const paid = /\b(?:paid|payment received|amount paid)\b/i.test(source);
  const recurringInterval = first(source, [/\b(?:billing|recurring)\s+(?:interval|cycle)\s*[:#-]\s*(monthly|yearly|annual|quarterly|weekly)/i]);
  const fingerprint = fingerprintText(source);

  return {
    ok: true,
    receipt: {
      id: `gmail-${fingerprint.slice(0, 24)}`,
      vendor,
      description: clean(first(source, [/\bdescription\s*[:#-]\s*([^|\n]{2,500})/i]), 500),
      orderNumber: invoiceNumber,
      date: transactionDate || issueDate,
      subtotal,
      tax: combinedOtherTax ?? (gstHst !== null || pst !== null ? (gstHst ?? 0) + (pst ?? 0) : null),
      total,
      currency,
      currencySymbol: "",
      category: "",
      reviewStatus: "needs-review",
      paymentStatus: (paid ? "paid" : "unknown") as PaymentStatus,
      businessUsePercent: null,
      notes: "",
      sourceMessageIds: [candidate.messageId],
      sourceUrl: "",
      duplicateCount: 1,
      sourceEmailText: source,
      importedAt: new Date().toISOString(),
      documentType: /\binvoice\b/i.test(source) ? "invoice" : /\breceipt\b/i.test(source) ? "receipt" : "unknown",
      invoiceNumber,
      transactionDate,
      issueDate,
      servicePeriod: first(source, [/\bservice\s+period\s*[:#-]\s*([^|\n]{2,120})/i]),
      gstHst,
      pst,
      combinedOtherTax,
      actualDueDate,
      recurring: Boolean(recurringInterval || expectedRenewalDate),
      recurringInterval,
      expectedRenewalDate,
      expectedRenewalBasis: expectedRenewalDate ? "Explicit renewal date found in the document; owner/accountant review required." : "",
      suggestedCategory: "Unassigned — owner/accountant review required",
      accountantReviewStatus: "needs-owner-accountant-review",
      gmailMessageId: candidate.messageId,
      attachmentIdentity: candidate.attachmentIdentity,
      contentFingerprint: fingerprint,
    },
  };
}

export function ingestionKeys(receipt: IngestibleReceipt): string[] {
  const keys = [`source:${receipt.gmailMessageId}|${receipt.attachmentIdentity}`];
  if (receipt.invoiceNumber) keys.push(`invoice:${receipt.vendor.toLowerCase()}|${receipt.invoiceNumber.toLowerCase()}`);
  keys.push(`fingerprint:${receipt.contentFingerprint}`);
  return keys;
}

export function mergeIngestedReceipts(existing: FinanceReceipt[], incoming: IngestibleReceipt[]) {
  const known = new Set<string>();
  for (const receipt of existing) {
    const extended = receipt as Partial<IngestibleReceipt>;
    if (extended.gmailMessageId && extended.attachmentIdentity) known.add(`source:${extended.gmailMessageId}|${extended.attachmentIdentity}`);
    if (extended.invoiceNumber) known.add(`invoice:${receipt.vendor.toLowerCase()}|${extended.invoiceNumber.toLowerCase()}`);
    if (extended.contentFingerprint) known.add(`fingerprint:${extended.contentFingerprint}`);
  }
  const unique: IngestibleReceipt[] = [];
  let duplicates = 0;
  for (const receipt of incoming) {
    const keys = ingestionKeys(receipt);
    if (keys.some((key) => known.has(key))) {
      duplicates += 1;
      continue;
    }
    unique.push(receipt);
    keys.forEach((key) => known.add(key));
  }
  const merged = mergeReceipts(existing, unique);
  return { ...merged, duplicates: duplicates + merged.duplicates };
}

export function safeIngestionSummary(receipts: FinanceReceipt[], added: IngestibleReceipt[], duplicates: number, needsReview: number) {
  return {
    filed: added.length,
    duplicatesSkipped: duplicates,
    needsReview,
    receipts: added.map((receipt) => ({
      vendor: receipt.vendor,
      documentType: receipt.documentType,
      date: receipt.transactionDate || receipt.issueDate || receipt.date || "not stated",
      total: receipt.total,
      currency: receipt.currency,
      paymentStatus: receipt.paymentStatus,
      dueDate: receipt.actualDueDate || null,
      expectedRenewalDate: receipt.actualDueDate ? null : receipt.expectedRenewalDate || null,
      expectedRenewalBasis: receipt.actualDueDate ? null : receipt.expectedRenewalBasis || null,
      accountantReviewStatus: receipt.accountantReviewStatus,
    })),
    totalsByCurrency: totalsByCurrency(receipts),
  };
}
