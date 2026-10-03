import { describe, expect, it } from "vitest";
import { classifyDocument, gmailLink, officeWeek, weeklyView, zonedDate, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";

const ev = (o: Partial<SubscriptionEvidence>): SubscriptionEvidence => ({
  id: "e1", kind: "receipt", matchStatus: "matched", subscriptionId: "s1", candidateIds: [], vendor: "Lovable",
  amount: 25, currency: "USD", documentDate: "", renewalDate: "", renewalBasis: "", mailbox: "canericaextreme@gmail.com",
  messageId: "18f0a1b2c3d4", attachmentIdentity: "", from: "", subject: "", fingerprint: "f", recordedAt: "2026-10-03T18:00:00Z",
  review: "needs-review", ...o,
});
const sub = (o: Partial<SubscriptionRecord>): SubscriptionRecord => ({
  id: "s1", name: "Lovable", scope: "office", aliases: [], senders: [], knownCost: null, billingCycle: "monthly",
  nextRenewal: null, history: [], notes: "", ...o,
} as SubscriptionRecord);

// Sat 3 Oct 2026 18:14 UTC = 11:14 in Whitehorse (UTC-7)
const NOW = new Date("2026-10-03T18:14:00Z");

describe("weekly subscription cards", () => {
  it("uses America/Whitehorse for the Monday–Sunday window", () => {
    const w = officeWeek(NOW);
    expect(w).toMatchObject({ start: "2026-09-28", end: "2026-10-04", today: "2026-10-03" });
    expect(w.label).toContain("America/Whitehorse");
    // 05:00 UTC Monday is still Sunday in Whitehorse
    expect(zonedDate("2026-10-05T05:00:00Z")).toBe("2026-10-04");
  });
  it("lists only this week's non-personal evidence", () => {
    const v = weeklyView([], [ev({ id: "a", documentDate: "2026-10-01" }), ev({ id: "b", documentDate: "2026-09-20" }), ev({ id: "c", documentDate: "2026-10-02", matchStatus: "personal" })], NOW);
    expect(v.emails.map((e) => e.id)).toEqual(["a"]);
  });
  it("flags failed payments, price changes and unknown senders without changing confirmed cost", () => {
    const s = sub({ knownCost: { amount: 20, currency: "USD", asOf: "2026-09-01", source: "John" } });
    const v = weeklyView([s], [ev({ id: "f", kind: "failed-payment" }), ev({ id: "p", kind: "receipt", amount: 30 }), ev({ id: "u", matchStatus: "unknown", subscriptionId: null })], NOW);
    expect(v.alerts.map((a) => a.evidence.id).sort()).toEqual(["f", "p", "u"]);
    expect(s.knownCost?.amount).toBe(20);
  });
  it("coming due labels estimates and email amounts as unconfirmed", () => {
    const v = weeklyView(
      [sub({ nextRenewal: { date: "2026-10-10", basis: "estimated", source: "John" } })],
      [ev({ id: "r", kind: "renewal-notice", subscriptionId: null, matchStatus: "unknown", renewalDate: "2026-10-20", renewalBasis: "explicit", amount: 99 })],
      NOW,
    );
    expect(v.comingDue[0]).toMatchObject({ date: "2026-10-10", basis: "estimated", cost: "Cost unknown" });
    expect(v.comingDue[1]?.cost).toContain("not confirmed");
    expect(v.comingDue[1]?.name).toContain("unmatched");
  });
  it("classifies declined payments separately and links to the source mailbox", () => {
    expect(classifyDocument("We were unable to process your card", "Your payment was declined")).toBe("failed-payment");
    expect(gmailLink("canerica14@gmail.com", "18f0a1b2c3d4")).toBe("https://mail.google.com/mail/?authuser=canerica14%40gmail.com#all/18f0a1b2c3d4");
    expect(gmailLink("x@y.com", "../bad")).toBe("");
  });
});
