import { describe, expect, it, vi } from "vitest";
import { STARTER_SUBSCRIPTIONS, buildGmailQuery, matchService, suggestedStarters, weeklyView, cleanSubscriptionList, type SubscriptionEvidence } from "./subscriptions";
import { runReceiptSyncWith, type SyncDeps } from "./receipt-ingestion.functions";

const sintra = STARTER_SUBSCRIPTIONS.find((s) => s.id === "s-sintra-ai")!;

describe("Sintra AI subscription (John, 2026-10-03)", () => {
  it("starter has aliases, no trusted sender, unknown cost/cadence/renewal and John's provenance", () => {
    expect(sintra.aliases).toEqual(["sintra ai", "sintra"]);
    expect(sintra.senderDomains).toEqual([]);
    expect(sintra.knownCost).toBeNull();
    expect(sintra.nextRenewal).toBeNull();
    expect(sintra.cadence).toBe("unknown");
    expect(sintra.notes).toContain("2026-10-03");
    expect(cleanSubscriptionList([sintra])?.[0]?.name).toBe("Sintra AI");
  });

  it("Gmail query searches the aliases plus non-receipt billing terms", () => {
    const q = buildGmailQuery([sintra]);
    expect(q).toContain('"sintra ai"');
    expect(q).toMatch(/\bsintra\b/);
    expect(q).toContain('"payment failed"');
    expect(q).toContain('"your plan"');
  });

  it("alias-only Sintra emails are unverified-sender, never matched", () => {
    const m = matchService("Billing <billing@sintra-mail.example>", "Your Sintra AI receipt", [sintra]);
    expect(m.status).toBe("unverified-sender");
    expect(m.subscriptionId).toBe("s-sintra-ai");
  });

  it("saved lists still see Sintra as an add-only suggestion; nothing auto-merged", () => {
    const saved = STARTER_SUBSCRIPTIONS.filter((s) => s.id !== "s-sintra-ai");
    expect(suggestedStarters(saved).map((s) => s.id)).toEqual(["s-sintra-ai"]);
    expect(suggestedStarters(STARTER_SUBSCRIPTIONS)).toEqual([]);
    expect(suggestedStarters([{ ...sintra, id: "custom" }])).not.toContainEqual(expect.objectContaining({ id: "s-sintra-ai" }));
  });

  it("weekly alerts flag unverified Sintra evidence for review", () => {
    const e = { id: "e", kind: "receipt", matchStatus: "unverified-sender", subscriptionId: "s-sintra-ai", candidateIds: [], vendor: "Sintra", amount: 39, currency: "USD", documentDate: "2026-10-01", renewalDate: "", renewalBasis: "", mailbox: "m", messageId: "x", attachmentIdentity: "body", from: "a@b.c", subject: "s", fingerprint: "f", recordedAt: "", review: "needs-review" } as SubscriptionEvidence;
    const v = weeklyView([sintra], [e], new Date("2026-10-03T19:00:00Z"));
    expect(v.alerts.some((a) => /not yet verified/.test(a.reason))).toBe(true);
  });

  it("sync: Sintra receipt goes to review (not matched office expense); promotion is not evidence", async () => {
    const written: { evidence: SubscriptionEvidence[]; receipts: Array<{ officeExpenseStatus?: string }> } = { evidence: [], receipts: [] };
    const doc = (id: string, subject: string, text: string) => ({
      mailbox: "canericaextreme@gmail.com", messageId: id, attachmentIdentity: "body", filename: "", mimeType: "text/plain", from: "Sintra <hello@sintra-news.example>", subject, text, receivedAt: "2026-10-02T10:00:00Z",
    });
    const deps = {
      verifyOwner: async () => ({ ok: true, userId: "o", email: "", aal: "aal2" }),
      gmailAccounts: () => [{ lovableApiKey: "x", connectionApiKey: "y", mailbox: "canericaextreme@gmail.com" }],
      readState: async () => ({ ok: true, checkpoint: null, receipts: [], subscriptions: [sintra], evidence: [] }),
      fetchCandidates: async () => ({
        documents: [
          doc("r1", "Your Sintra AI receipt", "Sintra AI\nReceipt\nAmount paid: $39.00 USD\nDate: 2026-10-01\nInvoice number: SIN-1001"),
          doc("p1", "Meet the new Sintra helpers", "Sintra has new AI helpers for your business. Try them today!"),
        ],
        checkpoint: "now", unsupported: 0,
      }),
      writeEvidence: vi.fn(async (_t: string, _o: string, ev: SubscriptionEvidence[]) => { written.evidence = ev; return { ok: true, added: ev.length, duplicates: 0 }; }),
      recordLastCheck: async () => true,
      atomicWrite: vi.fn(async (_t: string, _o: string, receipts: Array<{ officeExpenseStatus?: string }>) => { written.receipts = receipts; return { ok: true, filed: receipts, duplicates: 0, allReceipts: [] }; }),
    } as unknown as SyncDeps;
    await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(written.evidence.map((e) => e.messageId)).toEqual(["r1"]);
    expect(written.evidence[0]).toMatchObject({ matchStatus: "unverified-sender", review: "needs-review" });
    for (const r of written.receipts) expect(r.officeExpenseStatus).toBe("unconfirmed-needs-review");
  });
});
