import { describe, expect, it } from "vitest";
import { parseElsieReviewCommand, routineReviewDecision, selectRoutineReviews } from "./subscriptions-review";
import type { SubscriptionEvidence, SubscriptionRecord } from "./subscriptions";
import { EMPTY_PREFERENCES } from "./mail-preferences";

const service: SubscriptionRecord = { id: "s1", name: "Service", planName: "", aliases: [], senderDomains: ["example.com"], scope: "office", cadence: "monthly", knownCost: { amount: 24, currency: "USD", asOf: "2026-10-01", source: "John" }, nextRenewal: null, history: [], notes: "", updatedAt: "" };
const evidence = (id: string, patch: Partial<SubscriptionEvidence> = {}): SubscriptionEvidence => ({ id, kind: "receipt", matchStatus: "matched", subscriptionId: "s1", candidateIds: ["s1"], vendor: "Service", amount: 24, currency: "USD", documentDate: "2026-10-01", renewalDate: "", renewalBasis: "", mailbox: "owner@example.com", messageId: `m${id}`, attachmentIdentity: "", from: "billing@example.com", subject: "Receipt", fingerprint: `f${id}`, receivedAt: "2026-10-01T18:00:00Z", recordedAt: "2026-10-01T18:01:00Z", review: "needs-review", classificationReason: "Receipt found.", ...patch });

describe("Elsie deterministic Subscriptions review", () => {
  it("clears only routine items from a mixed 120-item set", () => {
    const rows = Array.from({ length: 120 }, (_, i) => evidence(String(i), i < 40 ? {} : i < 60 ? { kind: "failed-payment" } : i < 80 ? { matchStatus: "unknown", subscriptionId: null } : i < 100 ? { amount: null } : { kind: "deadline-notice", deadlineDate: "" }));
    const selected = selectRoutineReviews(rows, [service], EMPTY_PREFERENCES);
    expect(selected).toHaveLength(40);
    expect(selected.every((item) => item.reason.includes("payment is not inferred"))).toBe(true);
  });

  it("requires reliable values and leaves conflicts, missing currency and ambiguous history for John", () => {
    expect(routineReviewDecision(evidence("conflict", { matchStatus: "conflict" }), [service]).eligible).toBe(false);
    expect(routineReviewDecision(evidence("currency", { currency: null }), [service]).eligible).toBe(false);
    expect(routineReviewDecision(evidence("deadline", { kind: "deadline-notice", classificationAmbiguous: true }), [service]).eligible).toBe(false);
    expect(routineReviewDecision(evidence("rate", { kind: "price-change", amount: 30 }), [service]).reason).toContain("conflicts");
  });

  it("preserves reviewed, dismissed and ignored evidence", () => {
    const reviewed = evidence("reviewed", { review: "reviewed" });
    const dismissed = evidence("dismissed", { review: "dismissed" });
    const ignored = evidence("ignored");
    const prefs = { ...EMPTY_PREFERENCES, messages: [{ mailbox: ignored.mailbox, messageId: ignored.messageId, choice: "ignore" as const, from: ignored.from, subject: ignored.subject, decidedAt: "2026-10-01T00:00:00Z", source: "owner-ui" as const }] };
    expect(selectRoutineReviews([reviewed, dismissed, ignored], [service], prefs)).toEqual([]);
  });

  it("is idempotent once selected rows are reviewed", () => {
    const row = evidence("one");
    expect(selectRoutineReviews([row], [service])).toHaveLength(1);
    expect(selectRoutineReviews([{ ...row, review: "reviewed", reviewProvenance: { by: "elsie-deterministic", reason: "routine", at: "2026-10-01T00:00:00Z" } }], [service])).toHaveLength(0);
  });

  it("routes only dedicated commands and keeps questions, negations and hypotheticals read-only", () => {
    expect(parseElsieReviewCommand("review subscription emails")).toBe("run");
    expect(parseElsieReviewCommand("mark routine subscription emails reviewed")).toBe("run");
    expect(parseElsieReviewCommand("Elsie, please review subscription emails")).toBe("run");
    expect(parseElsieReviewCommand("Have you reviewed subscription emails?")).toBe("status");
    expect(parseElsieReviewCommand("Do not review subscription emails")).toBeNull();
    expect(parseElsieReviewCommand("If I asked you to review subscription emails, what happens?")).toBeNull();
    expect(parseElsieReviewCommand("Review subscription emails and delete them")).toBeNull();
  });
});