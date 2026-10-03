/**
 * Office subscriptions and billing evidence — pure, testable rules.
 *
 * Rules enforced here (do not relax):
 *  - A subscription record is created or changed only by John. Mail evidence
 *    never overwrites a confirmed cost or renewal date; it is stored beside it
 *    and flagged for review.
 *  - Unknown costs stay unknown (null). Currencies are never mixed.
 *  - A renewal date is "explicit" only when a document states it; anything
 *    John estimates is labelled "estimated". Warnings use sourced dates only.
 *  - Unknown, personal or conflicting senders are never treated as office
 *    expenses automatically; they go to review.
 *  - No tax eligibility or deductibility is ever claimed.
 */

export type SubscriptionScope = "office" | "personal" | "unknown";
export type RenewalBasis = "explicit" | "estimated";
export type EvidenceKind = "receipt" | "unpaid-invoice" | "renewal-notice" | "price-change" | "unknown";
export type MatchStatus = "matched" | "unknown" | "conflict" | "personal";

export interface BillingEntry {
  date: string;
  amount: number | null;
  currency: string | null;
  source: string;
}

export interface SubscriptionRecord {
  id: string;
  name: string;
  aliases: string[];
  senderDomains: string[];
  scope: SubscriptionScope;
  cadence: "monthly" | "yearly" | "other" | "unknown";
  /** Confirmed by John. null = unknown. */
  knownCost: { amount: number; currency: string; asOf: string; source: string } | null;
  nextRenewal: { date: string; basis: RenewalBasis; source: string } | null;
  history: BillingEntry[];
  notes: string;
  updatedAt: string;
}

export interface SubscriptionEvidence {
  id: string;
  kind: EvidenceKind;
  matchStatus: MatchStatus;
  subscriptionId: string | null;
  candidateIds: string[];
  vendor: string;
  amount: number | null;
  currency: string | null;
  documentDate: string;
  renewalDate: string;
  /** Only explicit — evidence never invents an estimate. */
  renewalBasis: "explicit" | "";
  mailbox: string;
  messageId: string;
  attachmentIdentity: string;
  from: string;
  subject: string;
  fingerprint: string;
  recordedAt: string;
  review: "needs-review" | "reviewed" | "dismissed";
}

export const MAX_SUBSCRIPTIONS = 200;
export const MAX_EVIDENCE = 1_000;

/** Starter suggestions shown only until John saves his own list. Never saved automatically. */
export const STARTER_SUBSCRIPTIONS: SubscriptionRecord[] = [
  starter("lovable", "Lovable", ["lovable"], ["lovable.dev"], "Development platform"),
  starter("supabase", "Supabase", ["supabase"], ["supabase.com", "supabase.io"], "CanX-owned database and sign-in"),
  starter("openai", "OpenAI", ["openai", "chatgpt"], ["openai.com"], "AI workers"),
  starter("anthropic", "Anthropic (Claude)", ["anthropic", "claude"], ["anthropic.com"], "Second Eyes reviewer"),
  starter("github", "GitHub", ["github"], ["github.com"], "Code hosting"),
];

function starter(id: string, name: string, aliases: string[], domains: string[], notes: string): SubscriptionRecord {
  return {
    id: `s-${id}`,
    name,
    aliases,
    senderDomains: domains,
    scope: "office",
    cadence: "unknown",
    knownCost: null,
    nextRenewal: null,
    history: [],
    notes,
    updatedAt: "",
  };
}

/* ------------------------------ validation ------------------------------ */

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const isoDate = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : "";
};
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
const ccy = (v: unknown) => {
  const s = str(v, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
};
const list = (v: unknown, max: number) =>
  Array.isArray(v) ? v.map((x) => str(x, 120).toLowerCase()).filter(Boolean).slice(0, max) : [];

export function cleanSubscription(input: unknown): SubscriptionRecord | null {
  const r = (input ?? {}) as Record<string, unknown>;
  const name = str(r["name"], 120);
  if (!name) return null;
  const cost = (r["knownCost"] ?? null) as Record<string, unknown> | null;
  const amount = cost ? money(cost["amount"]) : null;
  const currency = cost ? ccy(cost["currency"]) : null;
  const renewal = (r["nextRenewal"] ?? null) as Record<string, unknown> | null;
  const renewalDate = renewal ? isoDate(renewal["date"]) : "";
  const scope = r["scope"] === "office" || r["scope"] === "personal" ? r["scope"] : "unknown";
  const cadence = ["monthly", "yearly", "other"].includes(String(r["cadence"])) ? (r["cadence"] as SubscriptionRecord["cadence"]) : "unknown";
  return {
    id: str(r["id"], 60) || `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    aliases: list(r["aliases"], 12),
    senderDomains: list(r["senderDomains"], 12).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    scope,
    cadence,
    knownCost: amount !== null && currency ? { amount, currency, asOf: isoDate(cost?.["asOf"]), source: str(cost?.["source"], 200) || "John" } : null,
    nextRenewal: renewalDate
      ? { date: renewalDate, basis: renewal?.["basis"] === "explicit" ? "explicit" : "estimated", source: str(renewal?.["source"], 200) || "John" }
      : null,
    history: Array.isArray(r["history"])
      ? (r["history"] as unknown[]).slice(0, 120).flatMap((h) => {
          const e = (h ?? {}) as Record<string, unknown>;
          const date = isoDate(e["date"]);
          return date ? [{ date, amount: money(e["amount"]), currency: ccy(e["currency"]), source: str(e["source"], 200) }] : [];
        })
      : [],
    notes: str(r["notes"], 1000),
    updatedAt: str(r["updatedAt"], 40),
  };
}

export function cleanSubscriptionList(input: unknown): SubscriptionRecord[] | null {
  if (!Array.isArray(input) || input.length > MAX_SUBSCRIPTIONS) return null;
  const out: SubscriptionRecord[] = [];
  for (const row of input) {
    const clean = cleanSubscription(row);
    if (!clean) return null;
    out.push(clean);
  }
  return out;
}

export function cleanEvidenceList(input: unknown): SubscriptionEvidence[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_EVIDENCE).filter((e): e is SubscriptionEvidence => {
    const r = e as Partial<SubscriptionEvidence>;
    return typeof r?.id === "string" && typeof r.kind === "string" && typeof r.messageId === "string";
  });
}

/* ------------------------------ classification ------------------------------ */

export function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from);
  return m ? m[1]!.toLowerCase() : "";
}

export function classifyDocument(text: string, subject = ""): EvidenceKind {
  const t = `${subject}\n${text}`;
  if (/\b(?:price|pricing|rate)\s+(?:change|increase|update|adjustment)\b|\bnew\s+price\b|\bwill\s+(?:increase|change)\s+to\b/i.test(t)) return "price-change";
  const paid = /\b(?:paid|payment received|amount paid|payment successful|thank you for your payment)\b/i.test(t);
  const unpaid = /\b(?:amount due|balance due|payment due|unpaid|past due|overdue)\b/i.test(t);
  if (/\binvoice\b/i.test(t) && unpaid && !paid) return "unpaid-invoice";
  if (/\b(?:will renew|renews on|upcoming renewal|renewal (?:notice|reminder)|auto-?renew|next (?:billing|renewal) date)\b/i.test(t) && !paid) return "renewal-notice";
  if (paid || /\breceipt\b/i.test(t)) return "receipt";
  if (/\binvoice\b/i.test(t)) return unpaid ? "unpaid-invoice" : "receipt";
  return "unknown";
}

export interface ServiceMatch {
  status: MatchStatus;
  subscriptionId: string | null;
  candidateIds: string[];
}

/** Sender domain wins over text aliases. Several hits = conflict, never a guess. */
export function matchService(from: string, text: string, subscriptions: SubscriptionRecord[]): ServiceMatch {
  const domain = senderDomain(from);
  const byDomain = subscriptions.filter((s) => s.senderDomains.some((d) => domain === d || domain.endsWith(`.${d}`)));
  const lower = `${from}\n${text}`.toLowerCase();
  const byAlias = subscriptions.filter((s) =>
    [s.name.toLowerCase(), ...s.aliases].some((a) => a.length >= 3 && new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)),
  );
  const hits = byDomain.length > 0 ? byDomain : byAlias;
  const ids = [...new Set(hits.map((s) => s.id))];
  if (ids.length === 0) return { status: "unknown", subscriptionId: null, candidateIds: [] };
  if (ids.length > 1) return { status: "conflict", subscriptionId: null, candidateIds: ids };
  const hit = hits[0]!;
  if (hit.scope === "personal") return { status: "personal", subscriptionId: hit.id, candidateIds: ids };
  if (hit.scope !== "office") return { status: "conflict", subscriptionId: null, candidateIds: ids };
  return { status: "matched", subscriptionId: hit.id, candidateIds: ids };
}

/* ------------------------------ Gmail query ------------------------------ */

const BASE_TERMS = ["receipt", "invoice", "renewal", "\"renews on\"", "\"will renew\"", "subscription", "billing", "\"payment due\"", "\"price change\"", "\"price increase\""];

/** Covers billing/renewal keywords plus each known sender domain and alias. Bounded length. */
export function buildGmailQuery(subscriptions: SubscriptionRecord[]): string {
  const terms = [...BASE_TERMS];
  for (const s of subscriptions) {
    for (const d of s.senderDomains) terms.push(`from:${d}`);
    for (const a of s.aliases) if (/^[a-z0-9 .-]{3,40}$/.test(a)) terms.push(a.includes(" ") ? `"${a}"` : a);
  }
  const unique = [...new Set(terms)];
  const kept: string[] = [];
  let length = 0;
  for (const t of unique) {
    if (length + t.length > 1200) break;
    kept.push(t);
    length += t.length + 4;
  }
  return `(${kept.join(" OR ")}) newer_than:1y -in:spam -in:trash`;
}

/* ------------------------------ evidence rules ------------------------------ */

export function mergeEvidence(existing: SubscriptionEvidence[], incoming: SubscriptionEvidence[]) {
  const seen = new Set(existing.flatMap((e) => [e.fingerprint, `${e.messageId}|${e.attachmentIdentity}`]));
  const added: SubscriptionEvidence[] = [];
  let duplicates = 0;
  for (const e of incoming) {
    if (seen.has(e.fingerprint) || seen.has(`${e.messageId}|${e.attachmentIdentity}`)) {
      duplicates += 1;
      continue;
    }
    seen.add(e.fingerprint);
    seen.add(`${e.messageId}|${e.attachmentIdentity}`);
    added.push(e);
  }
  return { merged: [...existing, ...added].slice(-MAX_EVIDENCE), added, duplicates };
}

export interface RenewalWarning {
  subscriptionId: string | null;
  name: string;
  date: string;
  basis: RenewalBasis;
  source: string;
  daysAway: number;
}

const dayDiff = (date: string, now: Date) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);

/** Seven-day warnings, from sourced dates only (John's record or explicit document dates). */
export function renewalWarnings(subs: SubscriptionRecord[], evidence: SubscriptionEvidence[], now = new Date()): RenewalWarning[] {
  const out: RenewalWarning[] = [];
  for (const s of subs) {
    if (!s.nextRenewal) continue;
    const d = dayDiff(s.nextRenewal.date, now);
    if (d >= 0 && d <= 7) out.push({ subscriptionId: s.id, name: s.name, date: s.nextRenewal.date, basis: s.nextRenewal.basis, source: s.nextRenewal.source, daysAway: d });
  }
  for (const e of evidence) {
    if (e.review === "dismissed" || e.renewalBasis !== "explicit" || !e.renewalDate) continue;
    const d = dayDiff(e.renewalDate, now);
    if (d < 0 || d > 7) continue;
    if (out.some((w) => w.subscriptionId && w.subscriptionId === e.subscriptionId && w.date === e.renewalDate)) continue;
    const name = subs.find((s) => s.id === e.subscriptionId)?.name ?? `${e.vendor} (unmatched — review)`;
    out.push({ subscriptionId: e.subscriptionId, name, date: e.renewalDate, basis: "explicit", source: `Email from ${e.mailbox || "linked mailbox"}`, daysAway: d });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

export interface PriceFlag {
  evidenceId: string;
  subscriptionId: string;
  name: string;
  confirmed: { amount: number; currency: string };
  seen: { amount: number; currency: string };
}

/** Same-currency amount differs from John's confirmed cost → flag. Never overwrites. */
export function priceChangeFlags(subs: SubscriptionRecord[], evidence: SubscriptionEvidence[]): PriceFlag[] {
  const out: PriceFlag[] = [];
  for (const e of evidence) {
    if (e.review !== "needs-review" || e.matchStatus !== "matched" || !e.subscriptionId || e.amount === null || !e.currency) continue;
    const s = subs.find((x) => x.id === e.subscriptionId);
    if (!s?.knownCost || s.knownCost.currency !== e.currency) continue;
    if (Math.abs(s.knownCost.amount - e.amount) < 0.005) continue;
    out.push({ evidenceId: e.id, subscriptionId: s.id, name: s.name, confirmed: { amount: s.knownCost.amount, currency: s.knownCost.currency }, seen: { amount: e.amount, currency: e.currency } });
  }
  return out;
}
