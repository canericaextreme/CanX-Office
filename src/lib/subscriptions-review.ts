import type { SubscriptionEvidence, SubscriptionRecord } from "./subscriptions";
import { preferenceFor, type MailPreferences } from "./mail-preferences";

export const ELSIE_REVIEW_BY = "elsie-deterministic" as const;

export interface RoutineReviewDecision {
  eligible: boolean;
  reason: string;
}

export interface RoutineReviewItem {
  id: string;
  vendor: string;
  reason: string;
  mailbox: string;
  messageId: string;
  receivedAt: string;
}

const trusted = (e: SubscriptionEvidence) => e.matchStatus === "matched" && Boolean(e.subscriptionId) && !e.classificationAmbiguous;

/** Conservative deterministic rules. "Reviewed" never means paid, filed or currently healthy. */
export function routineReviewDecision(e: SubscriptionEvidence, subscriptions: SubscriptionRecord[]): RoutineReviewDecision {
  if (e.review !== "needs-review") return { eligible: false, reason: "Existing owner or earlier review decision preserved." };
  if (!trusted(e)) return { eligible: false, reason: "Sender or office-service match is unknown, unverified, conflicting, personal or ambiguous." };
  if (e.kind === "failed-payment" || e.kind === "unpaid-invoice") return { eligible: false, reason: "Payment failure and invoice status always remain for John." };
  if (e.kind === "unknown" || e.kind === "deadline-notice") return { eligible: false, reason: "Unreadable, unknown or deadline evidence needs John’s attention." };
  if (e.kind === "receipt") {
    return e.amount !== null && Boolean(e.currency)
      ? { eligible: true, reason: "Routine receipt email has a verified office-service match, amount and currency; payment is not inferred." }
      : { eligible: false, reason: "Receipt amount or currency is missing." };
  }
  if (e.kind === "renewal-notice") {
    return e.renewalDate
      ? { eligible: true, reason: "Routine renewal notice has a verified office-service match and explicitly stated date." }
      : { eligible: false, reason: "Renewal date is missing." };
  }
  if (e.kind === "price-change") {
    if (e.amount === null || !e.currency) return { eligible: false, reason: "Rate notice amount or currency is missing." };
    const service = subscriptions.find((s) => s.id === e.subscriptionId);
    if (service?.knownCost && (service.knownCost.amount !== e.amount || service.knownCost.currency !== e.currency)) {
      return { eligible: false, reason: "Email rate conflicts with the owner-confirmed rate." };
    }
    return { eligible: true, reason: "Routine rate notice is unambiguous and does not conflict with the owner-confirmed rate." };
  }
  if (e.kind === "promotion") {
    return e.classificationReason?.includes("Offer or promotion expiry only")
      ? { eligible: true, reason: "Explicit promotion-only notice; no bill, deadline or sender rule is inferred." }
      : { eligible: false, reason: "Promotion context is not explicit enough for routine review." };
  }
  return { eligible: false, reason: "This evidence type is not eligible for automatic routine review." };
}

export function selectRoutineReviews(evidence: SubscriptionEvidence[], subscriptions: SubscriptionRecord[], preferences?: MailPreferences): RoutineReviewItem[] {
  return evidence.flatMap((e) => {
    if (preferences && preferenceFor(preferences, e.mailbox, e.messageId, e.from).action === "ignore") return [];
    const decision = routineReviewDecision(e, subscriptions);
    return decision.eligible ? [{ id: e.id, vendor: e.vendor || "Unknown service", reason: decision.reason, mailbox: e.mailbox, messageId: e.messageId, receivedAt: e.receivedAt ?? "" }] : [];
  });
}

export type ElsieReviewCommand = "run" | "status" | null;

export function parseElsieReviewCommand(text: string): ElsieReviewCommand {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact || compact.length > 180) return null;
  if (/\b(?:do not|don't|dont|never|not now)\b/i.test(compact) || /\b(?:if|would|could)\b.*\b(?:review|mark)\b/i.test(compact)) return null;
  if (/\b(?:have|did|has)\b.*\b(?:reviewed|review)\b.*\bsubscription emails?\b/i.test(compact) || /\bwhat\b.*\b(?:reviewed|left for me)\b/i.test(compact)) return "status";
  return /^(?:elsie[, ]+)?(?:please )?(?:review subscription emails?|mark routine subscription emails? reviewed)[.!?]?$/i.test(compact) ? "run" : null;
}