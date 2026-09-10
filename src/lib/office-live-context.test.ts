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
  ownerEmail: "owner@example.com",
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
      { title: "Sample demo item", detail: "", kind: "task", provenance: "sample" },
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

  it("labels sample records as sample and never presents them as current work", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    if (!result.ok) throw new Error("expected ok");
    expect(result.text).toContain("(task, sample) Sample demo item");
    expect(result.text).toContain("Do not describe any project or work item as current");
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
    expect(summary.receipts).toBe(3);
    expect(summary.sourceMessages).toBe(4);
    expect(summary.needsReview).toBe(2);
    expect(summary.reconciled).toBe(1);
  });

  it("groups totals by original currency and never mixes them", () => {
    const summary = summariseReceiptDocument(JSON.stringify(receiptDoc));
    expect(summary.totalsByCurrency).toEqual([
      { currency: "CAD", total: 100.5, count: 1 },
      { currency: "USD", total: 40, count: 1 },
      { currency: "unspecified", total: 12.25, count: 1 },
    ]);
  });

  it("keeps every sensitive receipt field out of the context text", async () => {
    const result = await buildLiveOfficeContext(request(rest(FULL)));
    if (!result.ok) throw new Error("expected ok");
    for (const secret of SENSITIVE) expect(result.text).not.toContain(secret);
    expect(result.text).toContain("Receipts filed: 3");
    expect(result.text).toContain("CAD: 100.50 across 1 receipts");
  });
});
