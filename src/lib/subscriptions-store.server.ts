/**
 * Owner-scoped storage for subscription records and billing evidence.
 *
 * Persistence: the existing private `finance_receipts.doc` JSON document
 * (owner-only, owner role + two-step verification enforced by row security).
 * Two extra keys are kept beside the receipts: `subscriptions` and
 * `subscriptionEvidence`. No schema change is needed. Every write re-reads the
 * whole document, changes only its own key, and is verified by readback.
 */
import { RECEIPTS_KIND, RECEIPTS_SCHEMA_VERSION } from "./finance-receipts";
import {
  cleanEvidenceList,
  cleanLastCheck,
  type LastCheck,
  cleanSubscriptionList,
  mergeEvidence,
  type SubscriptionEvidence,
  type SubscriptionRecord,
} from "./subscriptions";
import { ELSIE_REVIEW_BY, selectRoutineReviews, type RoutineReviewItem } from "./subscriptions-review";
import { cleanGmailScanConfig, type GmailScanConfig } from "./gmail-scan-window";

type Backend = typeof import("./canx-backend.server");

async function readDoc(backend: Backend, token: string) {
  const config = backend.readBackendConfig();
  if (!config) return { ok: false as const, config: null, doc: null };
  const res = await backend.restRequest(config, token, "finance_receipts?select=doc&limit=1");
  if (!res.ok) return { ok: false as const, config, doc: null };
  const row = Array.isArray(res.body) ? (res.body[0] as { doc?: Record<string, unknown> } | undefined) : undefined;
  const doc = row?.doc ?? { schemaVersion: RECEIPTS_SCHEMA_VERSION, kind: RECEIPTS_KIND, receipts: [] };
  return { ok: true as const, config, doc };
}

async function cas(backend: Backend, token: string, ownerId: string, mutate: (d: Record<string, unknown>) => Record<string, unknown> | null, verify: (d: Record<string, unknown>) => boolean) {
  const config = backend.readBackendConfig();
  if (!config) return { ok: false as const, reason: "read_failed" as const, attempts: 0 };
  const { casUpdateFinanceDoc } = await import("./finance-doc-cas.server");
  return casUpdateFinanceDoc({ rest: backend.restRequest as never, config, token, ownerId, mutate, verify });
}

async function audit(backend: Backend, token: string, ownerId: string, action: string, detail: Record<string, number>) {
  const config = backend.readBackendConfig();
  if (!config) return;
  // Counts only: never a vendor, amount, or email text.
  await backend.restRequest(config, token, "office_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: ownerId, action, entity: "finance_receipts", detail }),
  });
}

export async function readSubscriptionState(token: string) {
  const backend = await import("./canx-backend.server");
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return null;
  const saved = read.doc["subscriptions"];
  return {
    saved: Array.isArray(saved),
    subscriptions: cleanSubscriptionList(saved ?? []) ?? [],
    evidence: cleanEvidenceList(read.doc["subscriptionEvidence"]),
    lastCheck: cleanLastCheck(read.doc["subscriptionLastCheck"]),
    scanConfig: cleanGmailScanConfig(read.doc["gmailScanConfig"]),
  };
}

export async function saveSubscriptions(token: string, ownerId: string, subscriptions: SubscriptionRecord[]) {
  const backend = await import("./canx-backend.server");
  const { sameContent } = await import("./finance-doc-cas.server");
  const stamp = new Date().toISOString();
  const stamped = subscriptions.map((s) => ({ ...s, updatedAt: stamp }));
  const res = await cas(backend, token, ownerId, (d) => ({ ...d, subscriptions: stamped }), (d) => sameContent(d["subscriptions"], stamped));
  if (res.ok) await audit(backend, token, ownerId, "finance.subscriptions.save", { count: stamped.length });
  return res.ok;
}

export async function setEvidenceReview(token: string, ownerId: string, id: string, review: SubscriptionEvidence["review"]) {
  const backend = await import("./canx-backend.server");
  const res = await cas(
    backend, token, ownerId,
    (d) => {
      const evidence = cleanEvidenceList(d["subscriptionEvidence"]);
      if (!evidence.some((e) => e.id === id)) return null;
      return { ...d, subscriptionEvidence: evidence.map((e) => (e.id === id ? { ...e, review } : e)) };
    },
    (d) => cleanEvidenceList(d["subscriptionEvidence"]).some((e) => e.id === id && e.review === review),
  );
  return res.ok;
}

export interface RoutineReviewSaveResult {
  ok: boolean;
  reviewed: number;
  alreadyReviewed: number;
  leftForJohn: number;
  items: RoutineReviewItem[];
}

export async function reviewRoutineEvidence(token: string, ownerId: string): Promise<RoutineReviewSaveResult> {
  const backend = await import("./canx-backend.server");
  let selected: RoutineReviewItem[] = [];
  let alreadyReviewed = 0;
  let leftForJohn = 0;
  const stamp = new Date().toISOString();
  const res = await cas(
    backend, token, ownerId,
    (d) => {
      const evidence = cleanEvidenceList(d["subscriptionEvidence"]);
      const subscriptions = cleanSubscriptionList(d["subscriptions"] ?? []) ?? [];
      selected = selectRoutineReviews(evidence, subscriptions);
      const ids = new Set(selected.map((item) => item.id));
      alreadyReviewed = evidence.filter((e) => e.review === "reviewed").length;
      leftForJohn = evidence.filter((e) => e.review === "needs-review" && !ids.has(e.id)).length;
      if (selected.length === 0) return d;
      const reasons = new Map(selected.map((item) => [item.id, item.reason]));
      return { ...d, subscriptionEvidence: evidence.map((e) => ids.has(e.id) ? { ...e, review: "reviewed" as const, reviewProvenance: { by: ELSIE_REVIEW_BY, reason: reasons.get(e.id) ?? "Routine deterministic review.", at: stamp } } : e) };
    },
    (d) => {
      const stored = new Map(cleanEvidenceList(d["subscriptionEvidence"]).map((e) => [e.id, e]));
      return selected.every((item) => {
        const e = stored.get(item.id);
        return e?.review === "reviewed" && e.reviewProvenance?.by === ELSIE_REVIEW_BY && e.reviewProvenance.reason === item.reason && e.reviewProvenance.at === stamp;
      });
    },
  );
  if (!res.ok) return { ok: false, reviewed: 0, alreadyReviewed: 0, leftForJohn: 0, items: [] };
  if (selected.length > 0) await audit(backend, token, ownerId, "finance.subscriptions.elsie_review", { reviewed: selected.length, leftForJohn });
  return { ok: true, reviewed: selected.length, alreadyReviewed, leftForJohn, items: selected };
}

export async function appendEvidence(token: string, ownerId: string, incoming: SubscriptionEvidence[]) {
  const backend = await import("./canx-backend.server");
  let added: SubscriptionEvidence[] = [];
  let updated: SubscriptionEvidence[] = [];
  let duplicates = 0;
  const res = await cas(
    backend, token, ownerId,
    (d) => {
      // Re-merged against the LATEST doc on every attempt, so a concurrent review status is kept.
      const merged = mergeEvidence(cleanEvidenceList(d["subscriptionEvidence"]), incoming);
      added = merged.added;
      updated = merged.updated;
      duplicates = merged.duplicates;
      return { ...d, subscriptionEvidence: merged.merged };
    },
    (d) => {
      const stored = new Map(cleanEvidenceList(d["subscriptionEvidence"]).map((e) => [e.id, e]));
      return [...added, ...updated].every((e) => {
        const row = stored.get(e.id);
        return row?.fingerprint === e.fingerprint && row.messageId === e.messageId && JSON.stringify(row.statedTerms ?? null) === JSON.stringify(e.statedTerms ?? null);
      });
    },
  );
  if (res.ok && (added.length > 0 || updated.length > 0)) await audit(backend, token, ownerId, "finance.subscriptions.evidence", { added: added.length, updated: updated.length });
  return { ok: res.ok, added: res.ok ? added.length : 0, duplicates: res.ok ? duplicates : 0 };
}

/** Records when both mailboxes were last checked, with scope and completeness. */
export async function recordLastCheck(token: string, ownerId: string, check: LastCheck) {
  const backend = await import("./canx-backend.server");
  const { sameContent } = await import("./finance-doc-cas.server");
  const res = await cas(backend, token, ownerId, (d) => ({ ...d, subscriptionLastCheck: check }), (d) => sameContent(d["subscriptionLastCheck"], check));
  return res.ok;
}

/** Per-mailbox Gmail continuation tokens (compare-and-swap, content-verified). */
export async function saveGmailContinuation(token: string, ownerId: string, next: Record<string, { token: string; query: string; savedAt: string }>) {
  const backend = await import("./canx-backend.server");
  const { sameContent } = await import("./finance-doc-cas.server");
  const res = await cas(backend, token, ownerId, (d) => ({ ...d, gmailContinuation: next }), (d) => sameContent(d["gmailContinuation"] ?? {}, next));
  return res.ok;
}

/** Dated scan window and resumable state, stored in the existing owner-only Finance document. */
export async function saveGmailScanConfig(token: string, ownerId: string, next: GmailScanConfig) {
  const backend = await import("./canx-backend.server");
  const { sameContent } = await import("./finance-doc-cas.server");
  const res = await cas(backend, token, ownerId, (d) => ({ ...d, gmailScanConfig: next }), (d) => sameContent(d["gmailScanConfig"], next));
  return res.ok;
}

/** Saves the dated scan state and mailbox cursors as one verified CAS change. */
export async function saveGmailScanProgress(
  token: string,
  ownerId: string,
  continuation: Record<string, { token: string; query: string; savedAt: string }>,
  scan: GmailScanConfig,
) {
  const backend = await import("./canx-backend.server");
  const { sameContent } = await import("./finance-doc-cas.server");
  const res = await cas(
    backend,
    token,
    ownerId,
    (d) => ({ ...d, gmailContinuation: continuation, gmailScanConfig: scan }),
    (d) => sameContent(d["gmailContinuation"] ?? {}, continuation) && sameContent(d["gmailScanConfig"], scan),
  );
  return res.ok;
}

/** Owner mail Keep/Ignore preferences (compare-and-swap, change-verified, other keys preserved). */
export async function readMailPreferences(token: string) {
  const backend = await import("./canx-backend.server");
  const { cleanMailPreferences } = await import("./mail-preferences");
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return null;
  return cleanMailPreferences(read.doc["mailPreferences"]);
}

export async function changeMailPreference(
  token: string,
  ownerId: string,
  change: import("./mail-preferences").PreferenceChange,
  by: import("./mail-preferences").PreferenceSource,
) {
  const backend = await import("./canx-backend.server");
  const mp = await import("./mail-preferences");
  const at = new Date().toISOString();
  let result = mp.cleanMailPreferences(null);
  const res = await cas(
    backend, token, ownerId,
    (d) => {
      // Applied to the LATEST doc on every attempt, so concurrent writers' keys survive.
      result = mp.applyPreferenceChange(mp.cleanMailPreferences(d["mailPreferences"]), change, at, by);
      return { ...d, mailPreferences: result };
    },
    (d) => mp.changeApplied(mp.cleanMailPreferences(d["mailPreferences"]), change),
  );
  if (res.ok) await audit(backend, token, ownerId, "finance.mail_preferences.change", { messages: result.messages.length, senders: result.senders.length });
  return res.ok ? { ok: true as const, preferences: result } : { ok: false as const };
}
