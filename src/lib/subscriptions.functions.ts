/**
 * Owner-only Subscriptions room server functions. Every call re-verifies the
 * owner (session, owner role, two-step verification) on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { cleanSubscriptionList, type LastCheck, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";
import type { GmailScanConfig } from "./gmail-scan-window";
import type { RoutineReviewItem } from "./subscriptions-review";
import { buildSubscriptionsSkillAudit, type SubscriptionSkillAuditReport } from "./subscriptions-skill-audit";

export interface SubscriptionsResult<T> {
  ok: boolean;
  message: string;
  data: T | null;
}

const token = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

/** Actionable, plain-English reasons; never raw provider errors. */
export const SAVE_FAILURE_MESSAGES: Record<"read_failed" | "write_failed" | "conflict" | "unverified" | "aborted", string> = {
  read_failed: "Not saved: the saved services could not be read first. Check your sign-in (two-step verification) and try Save again.",
  write_failed: "Not saved: the CanX account refused the change. Sign in again with two-step verification, then press Save.",
  conflict: "Not saved: the services list changed elsewhere at the same moment. Your typing is kept — press Save again.",
  unverified: "The change was sent but the re-read did not match, so it is not reported as saved. Your typing is kept — the list behind this form now shows what is actually stored.",
  aborted: "Not saved: nothing was changed.",
};

async function owner(accessToken: string) {
  const backend = await import("./canx-backend.server");
  if (!backend.readBackendConfig()) return { ok: false as const, message: backend.DENY_MESSAGES.backend_not_configured };
  const verified = await backend.verifyOwner(accessToken);
  return verified.ok ? { ok: true as const, userId: verified.userId, aal: verified.aal } : { ok: false as const, message: verified.message };
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
    const res = await store.saveSubscriptions(data.accessToken, who.userId, clean);
    return res.ok
      ? { ok: true, message: "Saved to the CanX account and read back.", data: { saved: clean.length } }
      : { ok: false, message: SAVE_FAILURE_MESSAGES[res.reason], data: null };
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

export type SubscriptionSkillAuditResult =
  | { ok: true; message: string; report: SubscriptionSkillAuditReport }
  | { ok: false; message: string; report: null };

export async function runSubscriptionsSkillAudit(accessToken: string, buildId = "unknown"): Promise<SubscriptionSkillAuditResult> {
  const who = await owner(accessToken);
  if (!who.ok) return { ok: false, message: who.message, report: null };
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return { ok: false, message: "The CanX account is not configured, so the skill check could not run.", report: null };
  const store = await import("./subscriptions-store.server");
  const snapshot = await import("./room-snapshot.server");
  const rooms = await import("./room-snapshot");
  const subscriptionsTarget = rooms.roomTargetForRoute("/subscriptions");
  const financeTarget = rooms.roomTargetForRoute("/finance");
  const checkedAt = new Date().toISOString();
  const [state, subscriptionsSnapshot, financeSnapshot] = await Promise.all([
    store.readSubscriptionState(accessToken).catch(() => null),
    subscriptionsTarget ? snapshot.readRoomSnapshotWith({ config, token: accessToken, aal: who.aal, target: subscriptionsTarget, buildId, rest: backend.restRequest }).catch(() => null) : null,
    financeTarget ? snapshot.readRoomSnapshotWith({ config, token: accessToken, aal: who.aal, target: financeTarget, buildId, rest: backend.restRequest }).catch(() => null) : null,
  ]);
  const report = buildSubscriptionsSkillAudit({ subscriptions: state?.subscriptions ?? [], evidence: state?.evidence ?? [], subscriptionsSnapshot, financeSnapshot, checkedAt });
  return { ok: true, message: `${report.completed} completed, ${report.blocked} blocked${report.notAttempted ? `, ${report.notAttempted} not attempted` : ""}. Installed instructions were checked; this did not mark any skill live-tested.`, report };
}
