/**
 * Owner-only Subscriptions room server functions. Every call re-verifies the
 * owner (session, owner role, two-step verification) on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { cleanSubscriptionList, type LastCheck, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";
import type { GmailScanConfig } from "./gmail-scan-window";
import type { RoutineReviewItem } from "./subscriptions-review";

export interface SubscriptionsResult<T> {
  ok: boolean;
  message: string;
  data: T | null;
}

const token = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

async function owner(accessToken: string) {
  const backend = await import("./canx-backend.server");
  if (!backend.readBackendConfig()) return { ok: false as const, message: backend.DENY_MESSAGES.backend_not_configured };
  const verified = await backend.verifyOwner(accessToken);
  return verified.ok ? { ok: true as const, userId: verified.userId } : { ok: false as const, message: verified.message };
}

export const listSubscriptions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input) }))
  .handler(async ({ data }): Promise<SubscriptionsResult<{ saved: boolean; subscriptions: SubscriptionRecord[]; evidence: SubscriptionEvidence[]; lastCheck: LastCheck | null; scanConfig: GmailScanConfig | null }>> => {
    const who = await owner(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message, data: null };
    const store = await import("./subscriptions-store.server");
    const state = await store.readSubscriptionState(data.accessToken);
    return state ? { ok: true, message: "", data: state } : { ok: false, message: "Subscriptions could not be read.", data: null };
  });

export const saveSubscriptionList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input), subscriptions: (input as { subscriptions?: unknown })?.subscriptions }))
  .handler(async ({ data }): Promise<SubscriptionsResult<{ saved: number }>> => {
    const who = await owner(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message, data: null };
    const clean = cleanSubscriptionList(data.subscriptions);
    if (!clean) return { ok: false, message: "The list was not in the expected shape, so nothing was changed.", data: null };
    const store = await import("./subscriptions-store.server");
    const ok = await store.saveSubscriptions(data.accessToken, who.userId, clean);
    return ok
      ? { ok: true, message: "Saved to the CanX account and read back.", data: { saved: clean.length } }
      : { ok: false, message: "The save could not be verified. Nothing is reported as saved.", data: null };
  });

export const reviewSubscriptionEvidence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { id?: unknown; review?: unknown };
    return {
      accessToken: token(input),
      id: typeof raw.id === "string" ? raw.id.slice(0, 80) : "",
      review: raw.review === "reviewed" || raw.review === "dismissed" ? raw.review : "needs-review",
    } as const;
  })
  .handler(async ({ data }): Promise<SubscriptionsResult<null>> => {
    const who = await owner(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message, data: null };
    const store = await import("./subscriptions-store.server");
    const ok = await store.setEvidenceReview(data.accessToken, who.userId, data.id, data.review);
    return { ok, message: ok ? "Updated." : "The change could not be verified.", data: null };
  });

export interface ElsieReviewResult {
  ok: boolean;
  message: string;
  reviewed: number;
  alreadyReviewed: number;
  leftForJohn: number;
  items: RoutineReviewItem[];
}

export async function runElsieSubscriptionReview(accessToken: string): Promise<ElsieReviewResult> {
  const who = await owner(accessToken);
  if (!who.ok) return { ok: false, message: who.message, reviewed: 0, alreadyReviewed: 0, leftForJohn: 0, items: [] };
  const store = await import("./subscriptions-store.server");
  const result = await store.reviewRoutineEvidence(accessToken, who.userId);
  return result.ok
    ? { ...result, message: `Elsie’s deterministic review was saved and read back: ${result.reviewed} newly reviewed, ${result.alreadyReviewed} already reviewed, ${result.leftForJohn} left for John. Reviewed does not mean paid, filed in Finance or currently healthy.` }
    : { ...result, message: "The routine review could not be read back, so no items are reported as reviewed." };
}

export const reviewRoutineSubscriptionEvidence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input) }))
  .handler(async ({ data }): Promise<ElsieReviewResult> => runElsieSubscriptionReview(data.accessToken));
