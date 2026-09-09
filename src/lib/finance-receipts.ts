/**
 * Finance receipts — private import, review and storage.
 *
 * Rules that this module enforces, and that must not be relaxed:
 *  - No real financial or email content is ever written into source, assets,
 *    seed SQL, or logs. Records only ever arrive from a private JSON file that
 *    John chooses by hand.
 *  - There is no automatic mailbox scan, no sending, and no mailbox change.
 *  - Email text is treated as untrusted plain text. It is never rendered as
 *    HTML and never used as an instruction.
 *  - An invalid or partly invalid import can never wipe records that already
 *    exist: parsing fully succeeds before anything is merged.
 *  - Totals are never added across different currencies, and "unknown"
 *    currency is a first-class case.
 */

export const RECEIPTS_SCHEMA_VERSION = 1;
export const RECEIPTS_KIND = "canx-finance-receipts";
/** Largest private import file accepted, in bytes. */
export const MAX_IMPORT_BYTES = 4_000_000;
export const MAX_RECEIPTS = 1_000;
const MAX_EMAIL_TEXT = 20_000;

export type ReviewStatus = "needs-review" | "reviewed" | "excluded";
export type PaymentStatus = "unknown" | "paid" | "refunded" | "reconciled";

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  "needs-review": "Needs review",
  reviewed: "Reviewed",
  excluded: "Not a business receipt",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unknown: "Unknown",
  paid: "Paid",
  refunded: "Refunded",
  reconciled: "Reconciled",
};

export interface FinanceReceipt {
  id: string;
  vendor: string;
  description: string;
  orderNumber: string;
  date: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  /** null means the currency was not stated in the source. */
  currency: string | null;
  currencySymbol: string;
  category: string;
  reviewStatus: ReviewStatus;
  paymentStatus: PaymentStatus;
  /** null means not decided yet. */
  businessUsePercent: number | null;
  notes: string;
  /** Evidence: the message ids this record came from. */
  sourceMessageIds: string[];
  sourceUrl: string;
  /** How many source messages were folded into this one record. */
  duplicateCount: number;
  /** Untrusted plain text kept as evidence. Never rendered as HTML. */
  sourceEmailText: string;
  importedAt: string;
}

export interface ParseResult {
  ok: boolean;
  errors: string[];
  receipts: FinanceReceipt[];
}

/* ------------------------------ helpers ------------------------------ */

const text = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  // Strip control characters so evidence text cannot smuggle terminal or
  // markup tricks. It is stored and shown as plain text only.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
};

const num = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

const percent = (value: unknown): number | null => {
  const n = num(value);
  if (n === null) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
};

const review = (value: unknown): ReviewStatus =>
  value === "reviewed" || value === "excluded" ? value : "needs-review";

const payment = (value: unknown): PaymentStatus =>
  value === "paid" || value === "refunded" || value === "reconciled" ? value : "unknown";

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function currencyKey(receipt: FinanceReceipt): string {
  return receipt.currency ? receipt.currency.toUpperCase() : "UNKNOWN";
}

export function currencyLabel(key: string): string {
  return key === "UNKNOWN" ? "Currency not stated" : key;
}

/* ------------------------------ parsing ------------------------------ */

function cleanReceipt(input: unknown, index: number, errors: string[]): FinanceReceipt | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    errors.push(`Receipt ${index + 1}: not a record.`);
    return null;
  }
  const row = input as Record<string, unknown>;
  const vendor = text(row["vendor"], 200).trim();
  if (!vendor) {
    errors.push(`Receipt ${index + 1}: the vendor is missing.`);
    return null;
  }
  const ids = Array.isArray(row["sourceMessageIds"])
    ? (row["sourceMessageIds"] as unknown[]).slice(0, 50).map((v) => text(v, 200)).filter(Boolean)
    : [];
  const currencyRaw = text(row["currency"], 8).trim().toUpperCase();
  const dup = num(row["duplicateCount"]);
  return {
    id: text(row["id"], 80) || `r-${index}-${vendor.slice(0, 8)}`,
    vendor,
    description: text(row["description"], 500),
    orderNumber: text(row["orderNumber"], 120).trim(),
    date: text(row["date"], 40).trim(),
    subtotal: num(row["subtotal"]),
    tax: num(row["tax"]),
    total: num(row["total"]),
    currency: /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : null,
    currencySymbol: text(row["currencySymbol"], 6),
    category: text(row["category"], 80),
    reviewStatus: review(row["reviewStatus"]),
    paymentStatus: payment(row["paymentStatus"]),
    businessUsePercent: percent(row["businessUsePercent"]),
    notes: text(row["notes"], 2000),
    sourceMessageIds: ids,
    sourceUrl: /^https?:\/\//i.test(text(row["sourceUrl"], 600)) ? text(row["sourceUrl"], 600) : "",
    duplicateCount: dup && dup > 0 ? Math.min(999, Math.round(dup)) : 1,
    sourceEmailText: text(row["sourceEmailText"], MAX_EMAIL_TEXT),
    importedAt: new Date().toISOString(),
  };
}

/** Parses a private import file. Returns errors instead of throwing. */
export function parseReceiptImport(raw: string): ParseResult {
  const errors: string[] = [];
  const fail = (message: string): ParseResult => ({ ok: false, errors: [message], receipts: [] });

  if (typeof raw !== "string" || !raw.trim()) return fail("The file was empty.");
  if (raw.length > MAX_IMPORT_BYTES) return fail("The file is larger than the 4 MB import limit.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("The file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("The file is not a CanX receipts file.");
  }
  const doc = parsed as Record<string, unknown>;
  if (doc["kind"] !== RECEIPTS_KIND) return fail("The file is not a CanX receipts file.");
  if (doc["schemaVersion"] !== RECEIPTS_SCHEMA_VERSION) {
    return fail(`This office reads receipts file version ${RECEIPTS_SCHEMA_VERSION} only.`);
  }
  const list = doc["receipts"];
  if (!Array.isArray(list)) return fail("The file has no receipts list.");
  if (list.length > MAX_RECEIPTS) return fail(`The file holds more than ${MAX_RECEIPTS} receipts.`);

  const receipts = list
    .slice(0, MAX_RECEIPTS)
    .map((item, index) => cleanReceipt(item, index, errors))
    .filter((r): r is FinanceReceipt => r !== null);

  if (!receipts.length) {
    return { ok: false, errors: errors.length ? errors : ["No usable receipts were found."], receipts: [] };
  }
  // Partly-bad files are reported, but the good rows are still previewed.
  return { ok: true, errors, receipts };
}

/* ---------------------------- duplicates ---------------------------- */

/** The keys that identify the same purchase. */
export function duplicateKeys(receipt: FinanceReceipt): string[] {
  const keys: string[] = [];
  if (receipt.orderNumber) keys.push(`order:${norm(receipt.vendor)}|${norm(receipt.orderNumber)}`);
  for (const id of receipt.sourceMessageIds) keys.push(`msg:${id}`);
  if (!receipt.orderNumber && receipt.date && receipt.total !== null) {
    keys.push(`vdt:${norm(receipt.vendor)}|${receipt.date}|${receipt.total}`);
  }
  return keys;
}

export interface MergeResult {
  merged: FinanceReceipt[];
  added: number;
  duplicates: number;
}

/**
 * Folds an import into the records already held. A repeat purchase is kept
 * once: its message ids are unioned and its duplicate count grows, so nothing
 * is counted twice.
 */
export function mergeReceipts(existing: FinanceReceipt[], incoming: FinanceReceipt[]): MergeResult {
  const merged = existing.map((r) => ({ ...r, sourceMessageIds: [...r.sourceMessageIds] }));
  const index = new Map<string, number>();
  merged.forEach((receipt, i) => {
    for (const key of duplicateKeys(receipt)) if (!index.has(key)) index.set(key, i);
  });

  let added = 0;
  let duplicates = 0;

  for (const receipt of incoming) {
    const keys = duplicateKeys(receipt);
    const hitAt = keys.map((k) => index.get(k)).find((i) => i !== undefined);
    if (hitAt === undefined) {
      merged.push({ ...receipt, sourceMessageIds: [...receipt.sourceMessageIds] });
      const position = merged.length - 1;
      for (const key of keys) if (!index.has(key)) index.set(key, position);
      added += 1;
      continue;
    }
    const target = merged[hitAt]!;
    for (const id of receipt.sourceMessageIds) {
      if (!target.sourceMessageIds.includes(id)) target.sourceMessageIds.push(id);
    }
    target.duplicateCount = Math.min(999, target.duplicateCount + receipt.duplicateCount);
    if (!target.sourceUrl && receipt.sourceUrl) target.sourceUrl = receipt.sourceUrl;
    if (!target.sourceEmailText && receipt.sourceEmailText) target.sourceEmailText = receipt.sourceEmailText;
    for (const key of keys) if (!index.has(key)) index.set(key, hitAt);
    duplicates += 1;
  }

  return { merged, added, duplicates };
}

/* ------------------------------ totals ------------------------------ */

export interface CurrencyTotal {
  currency: string;
  count: number;
  /** null when at least one included receipt has no total. */
  total: number | null;
}

/**
 * Totals grouped by currency. Currencies are never added together, and
 * receipts marked "Not a business receipt" are left out.
 */
export function totalsByCurrency(receipts: FinanceReceipt[]): CurrencyTotal[] {
  const groups = new Map<string, { count: number; total: number | null }>();
  for (const receipt of receipts) {
    if (receipt.reviewStatus === "excluded") continue;
    const key = currencyKey(receipt);
    const group = groups.get(key) ?? { count: 0, total: 0 };
    group.count += 1;
    if (receipt.total === null) group.total = null;
    else if (group.total !== null) group.total += receipt.total;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([currency, g]) => ({ currency, count: g.count, total: g.total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function reconciliationSummary(receipts: FinanceReceipt[]) {
  return {
    receipts: receipts.length,
    sourceMessages: receipts.reduce((sum, r) => sum + Math.max(r.duplicateCount, r.sourceMessageIds.length), 0),
    needsReview: receipts.filter((r) => r.reviewStatus === "needs-review").length,
    reconciled: receipts.filter((r) => r.paymentStatus === "reconciled").length,
  };
}

/* --------------------- device-only storage / export --------------------- */

const KEY = "canx-finance-receipts";

export function loadDeviceReceipts(): FinanceReceipt[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const result = parseReceiptImport(raw);
    return result.receipts;
  } catch {
    return [];
  }
}

export function saveDeviceReceipts(receipts: FinanceReceipt[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(toExportDocument(receipts)));
  } catch {
    /* storage unavailable: the office stays in memory for this visit */
  }
}

export function toExportDocument(receipts: FinanceReceipt[]) {
  return { schemaVersion: RECEIPTS_SCHEMA_VERSION, kind: RECEIPTS_KIND, receipts };
}
