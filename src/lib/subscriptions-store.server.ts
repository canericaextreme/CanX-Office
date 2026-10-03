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

export async function appendEvidence(token: string, ownerId: string, incoming: SubscriptionEvidence[]) {
  const backend = await import("./canx-backend.server");
  let added: SubscriptionEvidence[] = [];
  let duplicates = 0;
  const res = await cas(
    backend, token, ownerId,
    (d) => {
      // Re-merged against the LATEST doc on every attempt, so a concurrent review status is kept.
      const merged = mergeEvidence(cleanEvidenceList(d["subscriptionEvidence"]), incoming);
      added = merged.added;
      duplicates = merged.duplicates;
      return { ...d, subscriptionEvidence: merged.merged };
    },
    (d) => {
      const stored = new Map(cleanEvidenceList(d["subscriptionEvidence"]).map((e) => [e.id, e]));
      return added.every((e) => stored.get(e.id)?.fingerprint === e.fingerprint && stored.get(e.id)?.messageId === e.messageId);
    },
  );
  if (res.ok && added.length > 0) await audit(backend, token, ownerId, "finance.subscriptions.evidence", { added: added.length });
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
