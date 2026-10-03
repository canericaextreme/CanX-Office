import { describe, expect, it, vi } from "vitest";
import { fetchGmailReceiptCandidates } from "./gmail-receipts.server";
import { runReceiptSyncWith, type SyncDeps } from "./receipt-ingestion.functions";
import type { CandidateDocument } from "./receipt-ingestion";
import { weeklyView, type SubscriptionEvidence, type LastCheck } from "./subscriptions";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const settings = { lovableApiKey: "x", connectionApiKey: "a" };

function gmailFake(opts: { messages: number; failAttachment?: boolean; image?: boolean }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/users/me/profile")) return json({ emailAddress: "a@x.com" });
    if (url.includes("/users/me/messages?")) {
      return json({ messages: Array.from({ length: opts.messages }, (_, i) => ({ id: `m${i}` })), nextPageToken: "NEXT" });
    }
    if (url.includes("/attachments/")) return opts.failAttachment ? json({}, 503) : json({ data: b64("Total: USD 1.00"), size: 20 });
    const id = /messages\/([^?/]+)\?/.exec(url)![1]!;
    const parts = [
      { mimeType: "text/plain", partId: "0", body: { data: b64(`Receipt ${id} Total: USD 10.00`) } },
      { mimeType: "text/html", partId: "1", body: { data: b64(`<p>Receipt ${id}</p>`) } },
    ];
    if (opts.failAttachment && id === "m0") parts.push({ mimeType: "application/pdf", partId: "2", filename: "r.pdf", body: { attachmentId: "att1" } } as never);
    if (opts.image && id === "m0") parts.push({ mimeType: "image/png", partId: "3", filename: "r.png", body: { data: b64("\x89PNG") } } as never);
    return json({ internalDate: "1790000000000", payload: { headers: [{ name: "From", value: "billing@openai.com" }], mimeType: "multipart/mixed", parts } });
  }) as unknown as typeof fetch;
}

describe("Gmail page integrity", () => {
  it("returns every part of 25 messages (>25 documents) with received time", async () => {
    const r = await fetchGmailReceiptCandidates(settings, null, true, gmailFake({ messages: 25 }));
    expect(r.documents.length).toBe(50);
    expect(r.documents[0]!.receivedAt).toBe(new Date(1790000000000).toISOString());
    expect(r.fetchFailures).toBe(0);
  });
  it("counts a failed PDF attachment as an unprocessed fetch failure", async () => {
    const r = await fetchGmailReceiptCandidates(settings, null, true, gmailFake({ messages: 2, failAttachment: true }));
    expect(r.fetchFailures).toBe(1);
  });
});

const owner = { ok: true as const, userId: "o", email: "", aal: "aal2" as const };
const doc = (i: number): CandidateDocument => ({
  messageId: `m${Math.floor(i / 2)}`, attachmentIdentity: `p${i}`, filename: "", mimeType: "text/plain",
  text: `Vendor: OpenAI Invoice # OA-${i} Date: 2026-09-01 Total: USD ${i + 1}.00 Currency: USD Amount paid`,
  mailbox: "a@x.com", from: "OpenAI <billing@openai.com>", subject: "Your receipt", receivedAt: "2026-10-01T12:00:00Z",
});

function deps(over: Partial<SyncDeps> & { fetch?: Partial<Awaited<ReturnType<SyncDeps["fetchCandidates"]>>> } = {}) {
  const checks: LastCheck[] = [];
  const cont = vi.fn(async () => true);
  const filed: unknown[] = [];
  const d: SyncDeps = {
    verifyOwner: async () => owner,
    gmailAccounts: () => [settings],
    readState: async () => ({ ok: true, checkpoint: null, receipts: [], subscriptions: [], evidence: [] }),
    fetchCandidates: async () => ({ documents: Array.from({ length: 50 }, (_, i) => doc(i)), checkpoint: "1", unsupported: 0, partial: false, mailbox: "a@x.com", fetchFailures: 0, ...over.fetch }),
    atomicWrite: async (_t, _o, r) => { filed.push(...r); return { ok: true, filed: r, duplicates: 0, allReceipts: r }; },
    writeEvidence: async (_t, _o, e) => ({ ok: true, added: e.length, duplicates: 0 }),
    recordLastCheck: async (_t, _o, c) => { checks.push(c); return true; },
    saveContinuation: cont,
    ...over,
  };
  return { d, checks, cont, filed };
}
const req = { accessToken: "t", request: "check receipts" };

describe("truthful completion", () => {
  it("processes all 50 documents and records complete only after verified writes", async () => {
    const { d, checks, filed } = deps();
    const r = await runReceiptSyncWith(d, req);
    expect(r.ok).toBe(true);
    expect(filed.length).toBe(50);
    expect(checks).toHaveLength(1);
    expect(checks[0]!.complete).toBe(true);
  });
  it("evidence-save failure yields partial, not complete, and keeps page position", async () => {
    const { d, checks, cont } = deps({ fetch: { nextPageToken: "N", partial: true }, writeEvidence: async () => ({ ok: false, added: 0, duplicates: 0 }) });
    const r = await runReceiptSyncWith(d, req);
    expect(r.partial).toBe(true);
    expect(checks[0]!.complete).toBe(false);
    expect(cont).not.toHaveBeenCalled();
  });
  it("continuation-save failure yields incomplete last check", async () => {
    const { d, checks } = deps({ saveContinuation: async () => false });
    const r = await runReceiptSyncWith(d, req);
    expect(r.partial).toBe(true);
    expect(checks[0]!.complete).toBe(false);
  });
  it("attachment fetch failure keeps the old page position and is partial", async () => {
    const { d, checks, cont } = deps({ fetch: { fetchFailures: 1, nextPageToken: "N" } });
    const r = await runReceiptSyncWith(d, req);
    expect(r.partial).toBe(true);
    expect(checks[0]!.complete).toBe(false);
    expect((cont.mock.calls[0] as unknown[])[2]).toEqual({});
  });
  it("unreadable image receipts are reported as needing review", async () => {
    const { d, checks } = deps({ fetch: { needsReview: 1, unsupported: 1 } });
    const r = await runReceiptSyncWith(d, req);
    expect(r.message).toMatch(/need your review/);
    expect(checks[0]!.complete).toBe(false);
  });
});

describe("This week's emails uses Gmail received time", () => {
  const base: SubscriptionEvidence = {
    id: "x", kind: "receipt", matchStatus: "matched", subscriptionId: null, candidateIds: [], vendor: "V", amount: 1, currency: "USD",
    documentDate: "2026-10-01", renewalDate: "", renewalBasis: "", mailbox: "a@x.com", messageId: "abcdef12", attachmentIdentity: "", from: "", subject: "",
    fingerprint: "f", recordedAt: "2026-10-02T00:00:00Z", review: "needs-review",
  };
  it("excludes records with this-week transaction/ingestion dates but no received time", () => {
    const v = weeklyView([], [{ ...base, id: "old" }, { ...base, id: "new", receivedAt: "2026-09-30T20:00:00Z", documentDate: "2025-01-01" }, { ...base, id: "past", receivedAt: "2026-09-01T00:00:00Z" }], new Date("2026-10-03T18:00:00Z"));
    expect(v.emails.map((e) => e.id)).toEqual(["new"]);
    expect(v.emailsUnknownTime.map((e) => e.id)).toEqual(["old"]);
  });
});
