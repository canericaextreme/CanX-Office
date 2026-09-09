import { describe, expect, it } from "vitest";
import {
  currencyKey,
  duplicateKeys,
  MAX_IMPORT_BYTES,
  mergeReceipts,
  parseReceiptImport,
  reconciliationSummary,
  totalsByCurrency,
  type FinanceReceipt,
} from "./finance-receipts";

// Test-only placeholder values. No real vendor, amount, or email content.
function receipt(overrides: Partial<FinanceReceipt> = {}): FinanceReceipt {
  return {
    id: "r-1",
    vendor: "Test Vendor",
    description: "Placeholder line",
    orderNumber: "TEST-1",
    date: "2026-09-01",
    subtotal: 10,
    tax: 1,
    total: 11,
    currency: "CAD",
    currencySymbol: "$",
    category: "Software",
    reviewStatus: "needs-review",
    paymentStatus: "unknown",
    businessUsePercent: null,
    notes: "",
    sourceMessageIds: ["msg-1"],
    sourceUrl: "",
    duplicateCount: 1,
    sourceEmailText: "placeholder",
    importedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

function file(receipts: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ schemaVersion: 1, kind: "canx-finance-receipts", receipts, ...overrides });
}

describe("import validation", () => {
  it("accepts a well-formed private file", () => {
    const result = parseReceiptImport(file([receipt()]));
    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(1);
  });

  it("rejects malformed data", () => {
    for (const bad of ["", "not json", "[]", file([], { kind: "something-else" }), file([], { schemaVersion: 2 })]) {
      const result = parseReceiptImport(bad);
      expect(result.ok).toBe(false);
      expect(result.receipts).toEqual([]);
    }
  });

  it("rejects a file over the size limit", () => {
    const result = parseReceiptImport("x".repeat(MAX_IMPORT_BYTES + 1));
    expect(result.ok).toBe(false);
  });

  it("keeps good rows and reports bad rows, never throwing", () => {
    const result = parseReceiptImport(file([receipt(), { vendor: "" }, 42]));
    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(1);
    expect(result.errors.length).toBe(2);
  });

  it("strips control characters from untrusted email text", () => {
    const result = parseReceiptImport(file([receipt({ sourceEmailText: "line\u0000one\u001b[31m" })]));
    expect(result.receipts[0]!.sourceEmailText).toBe("lineone[31m");
  });

  it("treats an unstated or invalid currency as unknown", () => {
    const result = parseReceiptImport(file([receipt({ currency: null }), receipt({ id: "r-2", currency: "dollars" as unknown as string })]));
    expect(result.receipts.every((r) => r.currency === null)).toBe(true);
    expect(currencyKey(result.receipts[0]!)).toBe("UNKNOWN");
  });

  it("a failed import leaves earlier records untouched", () => {
    const existing = [receipt()];
    const bad = parseReceiptImport("not json");
    expect(bad.ok).toBe(false);
    const merged = mergeReceipts(existing, bad.receipts);
    expect(merged.merged).toHaveLength(1);
    expect(merged.added).toBe(0);
  });
});

describe("duplicates", () => {
  it("matches on vendor and order number", () => {
    const result = mergeReceipts([receipt()], [receipt({ id: "r-2", sourceMessageIds: ["msg-2"] })]);
    expect(result.merged).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.merged[0]!.sourceMessageIds).toEqual(["msg-1", "msg-2"]);
    expect(result.merged[0]!.duplicateCount).toBe(2);
  });

  it("matches on a shared source message id when there is no order number", () => {
    const a = receipt({ orderNumber: "" });
    const b = receipt({ id: "r-2", orderNumber: "", vendor: "Different Name" });
    const result = mergeReceipts([a], [b]);
    expect(result.merged).toHaveLength(1);
  });

  it("importing the same file twice does not double-count", () => {
    const first = parseReceiptImport(file([receipt(), receipt({ id: "r-2", orderNumber: "TEST-2", sourceMessageIds: ["msg-2"] })]));
    const once = mergeReceipts([], first.receipts);
    const twice = mergeReceipts(once.merged, parseReceiptImport(file([receipt(), receipt({ id: "r-2", orderNumber: "TEST-2", sourceMessageIds: ["msg-2"] })])).receipts);
    expect(once.merged).toHaveLength(2);
    expect(twice.merged).toHaveLength(2);
    expect(twice.added).toBe(0);
    expect(twice.duplicates).toBe(2);
    expect(totalsByCurrency(twice.merged)).toEqual([{ currency: "CAD", count: 2, total: 22 }]);
  });

  it("keeps genuinely different purchases apart", () => {
    const result = mergeReceipts([receipt()], [receipt({ id: "r-2", orderNumber: "TEST-9", sourceMessageIds: ["msg-9"] })]);
    expect(result.merged).toHaveLength(2);
    expect(result.added).toBe(1);
  });

  it("exposes the keys it matches on", () => {
    expect(duplicateKeys(receipt())).toContain("msg:msg-1");
  });
});

describe("totals", () => {
  it("never adds different currencies together", () => {
    const totals = totalsByCurrency([
      receipt(),
      receipt({ id: "r-2", orderNumber: "T2", currency: "USD", total: 5 }),
      receipt({ id: "r-3", orderNumber: "T3", currency: null, total: 7 }),
    ]);
    expect(totals).toEqual([
      { currency: "CAD", count: 1, total: 11 },
      { currency: "UNKNOWN", count: 1, total: 7 },
      { currency: "USD", count: 1, total: 5 },
    ]);
  });

  it("reports an unknown total rather than guessing", () => {
    expect(totalsByCurrency([receipt({ total: null })])).toEqual([{ currency: "CAD", count: 1, total: null }]);
  });

  it("leaves excluded receipts out of the totals", () => {
    expect(totalsByCurrency([receipt({ reviewStatus: "excluded" })])).toEqual([]);
  });

  it("counts actual imported records", () => {
    expect(reconciliationSummary([])).toEqual({ receipts: 0, sourceMessages: 0, needsReview: 0, reconciled: 0 });
    const summary = reconciliationSummary([receipt({ duplicateCount: 3 })]);
    expect(summary).toEqual({ receipts: 1, sourceMessages: 3, needsReview: 1, reconciled: 0 });
  });
});
