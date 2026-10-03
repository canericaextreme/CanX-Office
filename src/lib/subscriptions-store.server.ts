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

async function writeDoc(backend: Backend, token: string, ownerId: string, doc: Record<string, unknown>) {
  const config = backend.readBackendConfig();
  if (!config) return false;
  const res = await backend.restRequest(config, token, "finance_receipts?on_conflict=owner_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ owner_id: ownerId, doc, updated_at: new Date().toISOString() }]),
  });
  return res.ok;
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
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return false;
  const stamped = subscriptions.map((s) => ({ ...s, updatedAt: new Date().toISOString() }));
  if (!(await writeDoc(backend, token, ownerId, { ...read.doc, subscriptions: stamped }))) return false;
  const back = await readDoc(backend, token);
  const stored = Array.isArray(back.doc?.["subscriptions"]) ? (back.doc!["subscriptions"] as unknown[]) : null;
  const ok = Boolean(stored && stored.length === stamped.length);
  if (ok) await audit(backend, token, ownerId, "finance.subscriptions.save", { count: stamped.length });
  return ok;
}

export async function setEvidenceReview(token: string, ownerId: string, id: string, review: SubscriptionEvidence["review"]) {
  const backend = await import("./canx-backend.server");
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return false;
  const evidence = cleanEvidenceList(read.doc["subscriptionEvidence"]);
  if (!evidence.some((e) => e.id === id)) return false;
  const next = evidence.map((e) => (e.id === id ? { ...e, review } : e));
  if (!(await writeDoc(backend, token, ownerId, { ...read.doc, subscriptionEvidence: next }))) return false;
  const back = await readDoc(backend, token);
  return cleanEvidenceList(back.doc?.["subscriptionEvidence"]).some((e) => e.id === id && e.review === review);
}

export async function appendEvidence(token: string, ownerId: string, incoming: SubscriptionEvidence[]) {
  const backend = await import("./canx-backend.server");
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return { ok: false, added: 0, duplicates: 0 };
  const merged = mergeEvidence(cleanEvidenceList(read.doc["subscriptionEvidence"]), incoming);
  if (merged.added.length === 0) return { ok: true, added: 0, duplicates: merged.duplicates };
  if (!(await writeDoc(backend, token, ownerId, { ...read.doc, subscriptionEvidence: merged.merged }))) {
    return { ok: false, added: 0, duplicates: 0 };
  }
  const back = await readDoc(backend, token);
  const stored = new Set(cleanEvidenceList(back.doc?.["subscriptionEvidence"]).map((e) => e.id));
  const ok = merged.added.every((e) => stored.has(e.id));
  if (ok) await audit(backend, token, ownerId, "finance.subscriptions.evidence", { added: merged.added.length });
  return { ok, added: ok ? merged.added.length : 0, duplicates: merged.duplicates };
}

/** Records when both mailboxes were last checked, with scope and completeness. Verified by readback. */
export async function recordLastCheck(token: string, ownerId: string, check: LastCheck) {
  const backend = await import("./canx-backend.server");
  const read = await readDoc(backend, token);
  if (!read.ok || !read.doc) return false;
  if (!(await writeDoc(backend, token, ownerId, { ...read.doc, subscriptionLastCheck: check }))) return false;
  const back = await readDoc(backend, token);
  return cleanLastCheck(back.doc?.["subscriptionLastCheck"])?.at === check.at;
}
