import { describe, expect, it } from "vitest";
import { classifyBillingContext, classifyDocument, formatRoomReadAt, gmailLink, officeWeek, weeklyView, zonedDate, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";

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
    const v = weeklyView([], [ev({ id: "a", documentDate: "2026-10-01", receivedAt: "2026-10-01T18:00:00Z" }), ev({ id: "b", documentDate: "2026-09-20", receivedAt: "2026-09-20T18:00:00Z" }), ev({ id: "c", receivedAt: "2026-10-02T18:00:00Z", matchStatus: "personal" })], NOW);
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

  it("separates renewal deadlines from promotional expiry", () => {
    expect(classifyBillingContext("Your subscription expires on 2026-10-20")).toMatchObject({ kind: "deadline-notice", deadlineWhat: "subscription", deadlineDate: "2026-10-20" });
    expect(classifyBillingContext("Limited-time discount offer expires on 2026-10-20")).toMatchObject({ kind: "promotion", deadlineDate: "" });
    expect(classifyBillingContext("This offer expires; your account remains active")).toMatchObject({ kind: "promotion", deadlineDate: "" });
  });

  it("anchors relative trial and account deadlines to the received day in Whitehorse", () => {
    expect(classifyBillingContext("Your account expires in 9 days", "", "2026-10-01T06:30:00Z")).toMatchObject({ deadlineWhat: "account", deadlineDate: "2026-10-09", deadlineBasis: "relative-to-received" });
    expect(classifyBillingContext("Your trial ends in 7 days", "", "2026-10-01T07:30:00Z")).toMatchObject({ deadlineWhat: "trial", deadlineDate: "2026-10-08", deadlineBasis: "relative-to-received" });
    expect(classifyBillingContext("Your trial ends in 7 days")).toMatchObject({ deadlineWhat: "trial", deadlineDate: "", ambiguous: false });
  });

  it("keeps credentials distinct and ignores negated expiry wording", () => {
    expect(classifyBillingContext("Your API key expires on 2026-10-12")).toMatchObject({ kind: "deadline-notice", deadlineWhat: "api-key" });
    expect(classifyBillingContext("Your account does not expire")).toMatchObject({ kind: "unknown", deadlineDate: "" });
  });

  it("adds sourced service deadlines but never promotional expiry to coming due", () => {
    const deadline = ev({ id: "deadline", kind: "deadline-notice", deadlineWhat: "api-key", deadlineDate: "2026-10-12", deadlineBasis: "absolute", amount: null });
    const offer = ev({ id: "offer", kind: "promotion", deadlineDate: "", amount: null });
    const view = weeklyView([], [deadline, offer], NOW);
    expect(view.comingDue).toHaveLength(1);
    expect(view.comingDue[0]).toMatchObject({ what: "api-key", daysAway: 9, action: expect.stringContaining("credential") });
  });
});

describe("formatRoomReadAt", () => {
  it("shows the Whitehorse calendar date and time together", () => {
    // 00:30 UTC on Oct 4 is still Oct 3, 5:30 p.m. in Whitehorse (GMT-7).
    expect(formatRoomReadAt("2026-10-04T00:30:00Z")).toBe("Oct 3, 2026, 5:30 p.m. GMT-7");
  });
  it("never shows a time from a different calendar day", () => {
    const s = formatRoomReadAt("2026-10-04T06:59:00Z");
    expect(s).toContain("Oct 3, 2026");
    expect(s).toContain("11:59 p.m.");
  });
  it("falls back honestly for invalid values", () => {
    expect(formatRoomReadAt("not-a-date")).toBe("time not recorded");
    expect(formatRoomReadAt("")).toBe("time not recorded");
  });
});
