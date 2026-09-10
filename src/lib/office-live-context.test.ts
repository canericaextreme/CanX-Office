import { describe, expect, it, vi } from "vitest";
import { buildLiveOfficeContext, summariseReceiptDocument, type RestImpl } from "./office-live-context.server";
import { RECEIPTS_KIND, RECEIPTS_SCHEMA_VERSION } from "./finance-receipts";

const CONFIG = { url: "https://example.supabase.co", publishableKey: "pk-test" };

const receiptDoc = {
  schemaVersion: RECEIPTS_SCHEMA_VERSION,
  kind: RECEIPTS_KIND,
  receipts: [
    {
      id: "r1",
      vendor: "Acme Hardware Ltd",
      description: "Shop supplies",
      orderNumber: "ORD-778812",
      date: "2026-08-01",
      total: 100.5,
      currency: "cad",
      reviewStatus: "needs-review",
      paymentStatus: "paid",
      sourceMessageIds: ["msg-aaa-111", "msg-bbb-222"],
      sourceUrl: "https://mail.example.com/thread/9",
      sourceEmailText: "Thank you for your order from Acme Hardware.",
    },
    {
      id: "r2",
      vendor: "Northern Fuel",
      description: "Fuel",
      orderNumber: "ORD-99",
      date: "2026-08-04",
      total: 40,
      currency: "USD",
      reviewStatus: "reviewed",
      paymentStatus: "reconciled",
      sourceMessageIds: ["msg-ccc-333"],
      sourceUrl: "",
      sourceEmailText: "",
    },
    {
      id: "r4",
      vendor: "Acme Hardware Ltd",
      description: "More shop supplies",
      orderNumber: "ORD-778813",
      date: "2026-08-02",
      total: 25,
      currency: "CAD",
      reviewStatus: "reviewed",
      paymentStatus: "paid",
      sourceMessageIds: ["msg-ddd-444"],
      sourceUrl: "",
      sourceEmailText: "",
    },
    {
      id: "r3",
      vendor: "Unknown Shop",
      description: "Parts",
      orderNumber: "",
      date: "2026-08-06",
      total: 12.25,
      currency: null,
      reviewStatus: "needs-review",
      paymentStatus: "unknown",
      sourceMessageIds: [],
      sourceUrl: "",
      sourceEmailText: "",
    },
  ],
};

const SENSITIVE = [
  "Acme Hardware",
  "Northern Fuel",
  "ORD-778812",
  "msg-aaa-111",
  "https://mail.example.com/thread/9",
  "Thank you for your order",
  "100.5",
];

function rest(handlers: Record<string, { ok: boolean; body: unknown }>): RestImpl {
  return vi.fn(async (_config, _token, path: string) => {
    const key = Object.keys(handlers).find((k) => path.startsWith(k));
    const hit = key ? handlers[key]! : { ok: false, body: null };
    return { ok: hit.ok, status: hit.ok ? 200 : 500, body: hit.body };
  });
}

const request = (restImpl: RestImpl) => ({
  config: CONFIG,
  token: "token",
  aal: "aal2",
  provider: "OpenAI",
  model: "gpt-test",
  rest: restImpl,
});

const FULL = {
  office_notes: {
    ok: true,
    body: [
      { title: "Confirm AI limits row", detail: "Before any paid call", kind: "task", provenance: "john" },
      { title: "Sample demo item", detail: "Only for the demo", kind: "task", provenance: "sample" },
    ],
  },
  round_tables: { ok: true, body: [{ key: "monday-2026-09-14", updated_at: "2026-09-10T18:00:00Z" }] },
  finance_receipts: { ok: true, body: [{ doc: receiptDoc }] },
};

describe("live office context", () => {
  it("reports verified connection facts, live records and the configured model", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("CanX-owned database: connected");
    expect(result.text).toContain("owner@example.com");
    expect(result.text).toContain("aal2");
    expect(result.text).toContain("model: gpt-test");
    expect(result.text).toContain("Confirm AI limits row");
    expect(result.text).toContain("monday-2026-09-14");
    expect(result.text).toContain("last updated 2026-09-10T18:00:00Z");
  });

  it("excludes demonstration records entirely, matching what the context claims", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).not.toContain("Sample demo item");
    expect(result.text).not.toContain("Only for the demo");
    expect(result.text).not.toContain("sample");
    expect(result.text).toContain("Confirm AI limits row");
    expect(result.text).toContain("Do not describe any project or work item as current");
  });

  it("never sends the owner's email address to the provider", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(result.text).toContain("verified owner account is confirmed");
  });

  it("says none recorded when the office is empty, instead of using sample data", async () => {
    const result = await buildLiveOfficeContext(
      request(
        rest({
          office_notes: { ok: true, body: [] },
          round_tables: { ok: true, body: [] },
          finance_receipts: { ok: true, body: [] },
        }),
      ),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).toContain("notes, tasks and decisions [provenance: live database]: none recorded.");
    expect(result.text).toContain("Round table records [provenance: live database]: none recorded.");
    expect(result.text).toContain("Receipts filed: 0");
    expect(result.text).not.toContain("Trail Tales website");
  });

  for (const table of ["office_notes", "round_tables", "finance_receipts"]) {
    it(`fails closed when the ${table} read fails`, async () => {
      const handlers = { ...FULL, [table]: { ok: false, body: null } };
      const result = await buildLiveOfficeContext(request(rest(handlers)));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toMatch(/could not be read/);
    });
  }
});

describe("receipt aggregation and privacy", () => {
  it("counts receipts, source messages, review and reconciled state", () => {
    const summary = summariseReceiptDocument(JSON.stringify(receiptDoc));
    expect(summary.receipts).toBe(4);
    expect(summary.sourceMessages).toBe(5);
    expect(summary.needsReview).toBe(2);
    expect(summary.reconciled).toBe(1);
  });

  it("groups totals by original currency and never mixes them", () => {
    const summary = summariseReceiptDocument(JSON.stringify(receiptDoc));
    expect(summary.totalsByCurrency).toEqual([
      { currency: "CAD", total: 125.5, count: 2 },
      { currency: "UNKNOWN", total: 12.25, count: 1 },
      { currency: "USD", total: 40, count: 1 },
    ]);
  });

  it("keeps every sensitive receipt field out of the context text", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    if (!result.ok) throw new Error("expected ok");
    for (const secret of SENSITIVE) expect(result.text).not.toContain(secret);
    expect(result.text).toContain("Receipts filed: 4");
    expect(result.text).toContain("CAD: 125.50 across 2 receipts");
  });
});

describe("aggregate totals follow the Finance room's own rules", () => {
  const docWith = (rows: unknown[]) =>
    JSON.stringify({ schemaVersion: RECEIPTS_SCHEMA_VERSION, kind: RECEIPTS_KIND, receipts: rows });

  const base = {
    date: "2026-08-01",
    paymentStatus: "paid",
    sourceMessageIds: ["m1"],
    sourceUrl: "",
    sourceEmailText: "",
    orderNumber: "",
  };

  it("leaves receipts marked 'Not a business receipt' out of the money but still counts them", () => {
    const summary = summariseReceiptDocument(
      docWith([
        { ...base, id: "a", vendor: "One", description: "d", total: 30, currency: "CAD", reviewStatus: "reviewed" },
        { ...base, id: "b", vendor: "Two", description: "d", total: 900, currency: "CAD", reviewStatus: "excluded" },
      ]),
    );
    expect(summary.receipts).toBe(2);
    expect(summary.totalsByCurrency).toEqual([{ currency: "CAD", total: 30, count: 1 }]);
  });

  it("reports an unknown total, never zero, when an included receipt has no amount", async () => {
    const doc = docWith([
      { ...base, id: "a", vendor: "One", description: "d", total: 30, currency: "CAD", reviewStatus: "reviewed" },
      { ...base, id: "b", vendor: "Two", description: "d", total: null, currency: "CAD", reviewStatus: "reviewed" },
      { ...base, id: "c", vendor: "Three", description: "d", total: 12, currency: "USD", reviewStatus: "reviewed" },
    ]);
    const summary = summariseReceiptDocument(doc);
    expect(summary.totalsByCurrency).toEqual([
      { currency: "CAD", total: null, count: 2 },
      { currency: "USD", total: 12, count: 1 },
    ]);

    const result = await buildLiveOfficeContext(
      request(
        rest({
          office_notes: { ok: true, body: [] },
          round_tables: { ok: true, body: [] },
          finance_receipts: { ok: true, body: [{ doc: JSON.parse(doc) }] },
        }),
      ),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).toContain("CAD: total unknown (at least one receipt has no amount) across 2 receipts");
    expect(result.text).not.toContain("CAD: 0.00");
  });
});
