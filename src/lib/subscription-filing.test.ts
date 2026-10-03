import { describe, expect, it, vi } from "vitest";
import { runReceiptSyncWith, isExplicitReceiptSyncRequest, type SyncDeps } from "./receipt-ingestion.functions";
import type { CandidateDocument } from "./receipt-ingestion";
import {
  buildGmailQuery,
  classifyDocument,
  matchService,
  priceChangeFlags,
  renewalWarnings,
  cleanSubscription,
  type SubscriptionEvidence,
  type SubscriptionRecord,
} from "./subscriptions";

// Synthetic fixtures only — no real mail, no real Finance writes.
const openai: SubscriptionRecord = cleanSubscription({
  id: "s-openai", name: "OpenAI", aliases: ["chatgpt"], senderDomains: ["openai.com"], scope: "office",
  knownCost: { amount: 20, currency: "USD", asOf: "2026-09-01" },
})!;
const netflix: SubscriptionRecord = cleanSubscription({ id: "s-netflix", name: "Netflix", senderDomains: ["netflix.com"], scope: "personal" })!;
const subs = [openai, netflix];

const doc = (over: Partial<CandidateDocument>): CandidateDocument => ({
  messageId: "m1", attachmentIdentity: "a1", filename: "", mimeType: "text/plain", text: "", mailbox: "canericaextreme@gmail.com",
  from: "OpenAI <billing@openai.com>", subject: "Your receipt", ...over,
});
const RECEIPT = "Vendor: OpenAI Receipt Invoice # OA-100 Date: 2026-09-01 Total: USD 20.00 Currency: USD Amount paid";

const owner = { ok: true as const, userId: "owner", email: "", aal: "aal2" as const };
const settingsA = { lovableApiKey: "x", connectionApiKey: "a" };
const settingsB = { lovableApiKey: "x", connectionApiKey: "b" };

function deps(docsByKey: Record<string, CandidateDocument[] | Error>, extra: Partial<{ partial: boolean }> = {}) {
  const written: { receipts: unknown[]; evidence: SubscriptionEvidence[] } = { receipts: [], evidence: [] };
  const d: SyncDeps = {
    verifyOwner: vi.fn(async () => owner),
    gmailAccounts: vi.fn(() => Object.keys(docsByKey).map((k) => (k === "a" ? settingsA : settingsB))),
    readState: vi.fn(async () => ({ ok: true, checkpoint: "100", receipts: [], subscriptions: subs, evidence: [] })),
    fetchCandidates: vi.fn(async (s) => {
      const v = docsByKey[s.connectionApiKey]!;
      if (v instanceof Error) throw v;
      return { documents: v, checkpoint: "200", unsupported: 0, partial: extra.partial ?? false };
    }),
    atomicWrite: vi.fn(async (_t, _o, receipts, _c) => {
      written.receipts.push(...receipts);
      return { ok: true, filed: receipts, duplicates: 0, allReceipts: receipts };
    }),
    writeEvidence: vi.fn(async (_t, _o, ev) => {
      written.evidence.push(...ev);
      return { ok: true, added: ev.length, duplicates: 0 };
    }),
  };
  return { d, written };
}

describe("classification and matching", () => {
  it("separates receipt, unpaid invoice, renewal and price notices", () => {
    expect(classifyDocument(RECEIPT)).toBe("receipt");
    expect(classifyDocument("Invoice # 9 Amount due: USD 30.00 Due Date: 2026-10-10")).toBe("unpaid-invoice");
    expect(classifyDocument("Your plan will renew on 2026-10-05 for USD 20.00")).toBe("renewal-notice");
    expect(classifyDocument("Price change: your plan will increase to USD 25.00")).toBe("price-change");
    expect(classifyDocument("Lunch on Saturday?")).toBe("unknown");
  });

  it("matches by sender domain, sends unknown and conflicts to review", () => {
    expect(matchService("billing@openai.com", "", subs)).toMatchObject({ status: "matched", subscriptionId: "s-openai" });
    expect(matchService("shop@unknown-store.ca", "receipt", subs).status).toBe("unknown");
    expect(matchService("info@netflix.com", "", subs).status).toBe("personal");
    expect(matchService("news@reseller.ca", "OpenAI and Netflix bundle", subs).status).toBe("conflict");
  });

  it("Gmail query covers aliases, senders and renewal/billing notices", () => {
    const q = buildGmailQuery(subs);
    for (const term of ["from:openai.com", "chatgpt", "renewal", "billing", "\"price change\"", "receipt", "invoice"]) expect(q).toContain(term);
    expect(q).toContain("newer_than:1y");
  });
});

describe("end-to-end filing with synthetic mail", () => {
  it("files a known-service receipt and records matched evidence", async () => {
    const { d, written } = deps({ a: [doc({ text: RECEIPT })] });
    const r = await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts and subscriptions" });
    expect(r.ok).toBe(true);
    expect(written.receipts).toHaveLength(1);
    expect(written.receipts[0]).toMatchObject({ serviceMatchStatus: "matched", matchedSubscriptionId: "s-openai", gmailMailbox: "canericaextreme@gmail.com", reviewStatus: "needs-review" });
    expect(written.evidence[0]).toMatchObject({ kind: "receipt", matchStatus: "matched", amount: 20, currency: "USD" });
    expect(r.message).not.toMatch(/deductible|eligible/i);
  });

  it("unknown sender goes to review, never as an office expense; personal is not filed", async () => {
    const { d, written } = deps({ a: [
      doc({ messageId: "u1", from: "Corner Store <hi@corner.ca>", text: "Vendor: Corner Store Receipt Total: CAD 9.50 Currency: CAD paid" }),
      doc({ messageId: "n1", from: "Netflix <info@netflix.com>", text: "Vendor: Netflix Receipt Total: CAD 16.00 Currency: CAD paid" }),
    ] });
    const r = await runReceiptSyncWith(d, { accessToken: "t", request: "review receipts" });
    expect(written.receipts).toHaveLength(1);
    expect(written.receipts[0]).toMatchObject({ serviceMatchStatus: "unknown", officeExpenseStatus: "unconfirmed-needs-review" });
    expect(r.sentToReview).toBe(1);
    expect(r.notFiledPersonal).toBe(1);
  });

  it("deduplicates body + attachment and the same mail in both mailboxes", async () => {
    const body = doc({ messageId: "m1", attachmentIdentity: "0", mimeType: "text/plain", text: RECEIPT });
    const pdf = doc({ messageId: "m1", attachmentIdentity: "att-pdf", mimeType: "application/pdf", text: `${RECEIPT} (PDF copy)` });
    const otherMailbox = doc({ messageId: "x9", mailbox: "canerica14@gmail.com", text: RECEIPT });
    const { d, written } = deps({ a: [body, pdf], b: [otherMailbox] });
    await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts" });
    expect(written.receipts).toHaveLength(1);
    expect((written.receipts[0] as { attachmentIdentity: string }).attachmentIdentity).toBe("att-pdf");
  });

  it("files an unpaid invoice as an invoice, never as paid", async () => {
    const { d, written } = deps({ a: [doc({ subject: "Invoice", text: "Vendor: OpenAI Invoice # OA-7 Issue Date: 2026-09-20 Amount due: USD 30.00 Currency: USD Due Date: 2026-10-10" })] });
    await runReceiptSyncWith(d, { accessToken: "t", request: "check invoices" });
    expect(written.receipts[0]).toMatchObject({ documentType: "invoice", paymentStatus: "unknown", invoicePaymentState: "unpaid-stated", actualDueDate: "2026-10-10" });
  });

  it("renewal and price notices become evidence only, not Finance receipts", async () => {
    const { d, written } = deps({ a: [
      doc({ messageId: "r1", subject: "Upcoming renewal", text: "Your ChatGPT plan will renew on 2026-10-05 for USD 20.00" }),
      doc({ messageId: "p1", subject: "Price change", text: "Price change: from 2026-11-01 your plan will increase to USD 25.00" }),
    ] });
    await runReceiptSyncWith(d, { accessToken: "t", request: "check subscriptions" });
    expect(written.receipts).toHaveLength(0);
    expect(written.evidence.map((e) => e.kind).sort()).toEqual(["price-change", "renewal-notice"]);
    expect(written.evidence.find((e) => e.kind === "renewal-notice")).toMatchObject({ renewalDate: "2026-10-05", renewalBasis: "explicit" });
    const flags = priceChangeFlags(subs, written.evidence);
    expect(flags[0]).toMatchObject({ confirmed: { amount: 20, currency: "USD" }, seen: { amount: 25, currency: "USD" } });
    expect(openai.knownCost?.amount).toBe(20); // never silently overwritten
  });

  it("missing or ambiguous dates and currency stay unknown", async () => {
    const { d, written } = deps({ a: [doc({ text: "Vendor: OpenAI Receipt Date: 03/04/2026 Total: $20.00 paid" })] });
    await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts" });
    expect(written.receipts[0]).toMatchObject({ date: "", currency: null });
  });

  it("auth failure on every mailbox files nothing", async () => {
    const { d } = deps({ a: new Error("gmail_authorization_required"), b: new Error("gmail_authorization_required") });
    const r = await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts" });
    expect(r.code).toBe("gmail_authorization_required");
    expect(d.atomicWrite).not.toHaveBeenCalled();
  });

  it("partial mailbox failure and capped page are reported and keep the checkpoint", async () => {
    const { d } = deps({ a: [doc({ text: RECEIPT })], b: new Error("gmail_unavailable") }, { partial: true });
    const r = await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts" });
    expect(r.partial).toBe(true);
    expect(r.mailboxesFailed).toBe(1);
    expect(r.message).toMatch(/not all mail was checked/);
    expect(r.message).toMatch(/could not be read this time/);
    expect((d.atomicWrite as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toBe("100");
  });

  it("owner/MFA failure contacts no mailbox", async () => {
    const { d } = deps({ a: [] });
    (d.verifyOwner as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: "mfa_required", message: "MFA" });
    const r = await runReceiptSyncWith(d, { accessToken: "t", request: "check receipts" });
    expect(r.code).toBe("auth_not_ready");
    expect(d.fetchCandidates).not.toHaveBeenCalled();
  });

  it("recognizes subscription requests explicitly", () => {
    expect(isExplicitReceiptSyncRequest("Elsie, check subscriptions and renewals")).toBe(true);
    expect(isExplicitReceiptSyncRequest("what are subscriptions?")).toBe(false);
  });
});

describe("renewal warnings", () => {
  it("warns within seven days from sourced dates only", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const s = { ...openai, nextRenewal: { date: "2026-10-05", basis: "estimated" as const, source: "John" } };
    const far = { ...netflix, nextRenewal: { date: "2026-10-20", basis: "explicit" as const, source: "bill" } };
    const w = renewalWarnings([s, far], [], now);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ daysAway: 4, basis: "estimated" });
    expect(renewalWarnings([openai], [], now)).toHaveLength(0); // no date → no warning
  });
});
