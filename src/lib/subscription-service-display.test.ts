import { describe, expect, it } from "vitest";
import { extractEmailStatedTerms, serviceBillingCounts, serviceBillingDisplay, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";

const service = (id: string, patch: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({ id, name: id, aliases: [], senderDomains: [], scope: "office", cadence: "unknown", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "", ...patch });
const email = (id: string, subscriptionId: string, text: string): SubscriptionEvidence => ({ id, kind: "renewal-notice", matchStatus: "matched", subscriptionId, candidateIds: [subscriptionId], vendor: subscriptionId, amount: null, currency: null, documentDate: "", renewalDate: "", renewalBasis: "", mailbox: "owner@example.com", messageId: `m${id}`, attachmentIdentity: "", from: "billing@example.com", subject: "Billing terms", fingerprint: `f${id}`, receivedAt: "2026-10-04T01:00:00Z", recordedAt: "2026-10-04T01:01:00Z", review: "needs-review", statedTerms: extractEmailStatedTerms(text) ?? undefined });

describe("glanceable service billing display", () => {
  it("keeps recurring, yearly, non-recurring, usage and unknown states distinct", () => {
    const rows = [
      service("monthly", { cadence: "monthly", knownCost: { amount: 24, currency: "USD", asOf: "2026-10-01", source: "John" } }),
      service("yearly", { cadence: "yearly", knownCost: { amount: 120, currency: "CAD", asOf: "2026-10-01", source: "John" } }),
      service("once", { recurrenceStatus: "not-recurring", knownCost: { amount: 50, currency: "USD", asOf: "2026-10-01", source: "John" } }),
      service("api", { recurrenceStatus: "usage-based" }),
      service("unknown"),
    ];
    expect(serviceBillingDisplay(rows[0]!, [])).toMatchObject({ rate: "USD $24.00 / month", recurrenceLabel: "Recurring — monthly" });
    expect(serviceBillingDisplay(rows[1]!, [])).toMatchObject({ rate: "CAD $120.00 / year", recurrenceLabel: "Recurring — yearly" });
    expect(serviceBillingDisplay(rows[2]!, [])).toMatchObject({ rate: "USD $50.00 one-time", recurrenceLabel: "Not recurring" });
    expect(serviceBillingDisplay(rows[3]!, [])).toMatchObject({ rate: "Usage-based", recurrenceLabel: "Usage-based" });
    expect(serviceBillingDisplay(rows[4]!, [])).toMatchObject({ rate: "Rate unknown", recurrenceLabel: "Recurring status unconfirmed" });
    expect(serviceBillingCounts(rows, [])).toEqual({ services: 5, recurring: 2, notRecurring: 1, usageBased: 1, unconfirmed: 1 });
  });

  it("uses reliable email-stated recurrence without confusing it with auto-renew", () => {
    const row = service("lovable");
    const stated = email("1", "lovable", "Plan: Business\nRecurring subscription billed monthly at USD $24 per month. Auto-renew is disabled. Billing date: 2026-10-04");
    expect(serviceBillingDisplay(row, [stated])).toMatchObject({ rate: "USD $24.00 / month", recurrenceLabel: "Recurring — monthly", autoRenew: "disabled" });
  });

  it("does not turn API top-ups or annual amounts into monthly rates", () => {
    const api = service("api");
    const usage = email("2", "api", "OpenAI API usage-based charges. Pay as you go. No fixed plan rate.");
    expect(serviceBillingDisplay(api, [usage])).toMatchObject({ rate: "Usage-based", recurrence: "usage-based" });
    expect(extractEmailStatedTerms("API credit top-up USD $50 one-time")).toBeNull();
    expect(serviceBillingDisplay(service("annual"), [email("3", "annual", "Plan: Pro\nCAD $240 billed annually")])).toMatchObject({ rate: "CAD $240.00 / year", recurrenceLabel: "Recurring — yearly" });
  });
});