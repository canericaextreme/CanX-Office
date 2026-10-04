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
export type EvidenceKind = "receipt" | "unpaid-invoice" | "renewal-notice" | "deadline-notice" | "promotion" | "price-change" | "failed-payment" | "unknown";
export type DeadlineWhat = "subscription" | "trial" | "service" | "account" | "domain" | "api-key" | "credential" | "payment-card" | "payment" | "unknown";
/** "unverified-sender": named by alias only, and John has not yet verified a sender domain for that service. Always review. */
export type MatchStatus = "matched" | "unknown" | "conflict" | "personal" | "unverified-sender";

export interface BillingEntry {
  date: string;
  amount: number | null;
  currency: string | null;
  source: string;
}

export interface SubscriptionRecord {
  id: string;
  name: string;
  planName?: string;
  /** Optional owner-recorded plan/tier. Never inferred into the owner record from email. */
  planName?: string;
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
  /** Gmail internalDate (ISO) of the source email. Absent on older records = unknown. */
  receivedAt?: string;
  recordedAt: string;
  review: "needs-review" | "reviewed" | "dismissed";
  /** Derived from the bounded source text at ingestion; absent on historical evidence without retained text. */
  classificationReason?: string;
  deadlineWhat?: DeadlineWhat;
  deadlineDate?: string;
  deadlineBasis?: "absolute" | "relative-to-received";
  classificationAmbiguous?: boolean;
  /** Source-grounded recurring terms stated by this email; never owner-confirmed automatically. */
  statedTerms?: EmailStatedTerms;
}

export type BillingInterval = "monthly" | "yearly";
export type BillingProduct = "chatgpt-subscription" | "openai-api" | "other" | "unknown";

export interface EmailStatedTerms {
  planName: string;
  recurringAmount: number | null;
  currency: string | null;
  interval: BillingInterval | null;
  effectiveDate: string;
  product: BillingProduct;
  reason: string;
  ambiguous: boolean;
}

export const MAX_SUBSCRIPTIONS = 200;
export const MAX_EVIDENCE = 1_000;

/** Starter suggestions shown only until John saves his own list. Never saved automatically. */
export const STARTER_SUBSCRIPTIONS: SubscriptionRecord[] = [
  starter("lovable", "Lovable", ["lovable"], ["lovable.dev"], "Development platform"),
  starter("supabase", "Supabase", ["supabase"], ["supabase.com", "supabase.io"], "CanX-owned database and sign-in"),
    planName: "",
  starter("openai", "OpenAI", ["openai", "chatgpt"], ["openai.com"], "AI workers"),
  starter("anthropic", "Anthropic (Claude)", ["anthropic", "claude"], ["anthropic.com"], "Second Eyes reviewer"),
  starter("github", "GitHub", ["github"], ["github.com"], "Code hosting"),
  // John said on 2026-10-03 that the office uses Sintra AI. No sender domain is
  // trusted until John verifies one, so every Sintra email goes to review.
  starter("sintra-ai", "Sintra AI", ["sintra ai", "sintra"], [], "Usage confirmed by John on 2026-10-03. Sender address not yet verified; cost, cadence and renewal unknown."),
];

/** Starter suggestions missing from John's saved list (by id or name). Never added automatically. */
export function suggestedStarters(saved: SubscriptionRecord[]): SubscriptionRecord[] {
  const ids = new Set(saved.map((s) => s.id));
  const names = new Set(saved.map((s) => s.name.trim().toLowerCase()));
  return STARTER_SUBSCRIPTIONS.filter((s) => !ids.has(s.id) && !names.has(s.name.toLowerCase()));
}

function starter(id: string, name: string, aliases: string[], domains: string[], notes: string): SubscriptionRecord {
  return {
    id: `s-${id}`,
    name,
    planName: "",
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

  const planName = str(r["planName"], 60);
/* ------------------------------ validation ------------------------------ */

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const isoDate = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : "";
};
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
    planName,
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
    planName: str(r["planName"], 120),
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
    planName: str(r["planName"], 60),
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
  return input.slice(0, MAX_EVIDENCE).flatMap((e) => {
    const r = e as Partial<SubscriptionEvidence>;
    if (typeof r?.id !== "string" || typeof r.kind !== "string" || typeof r.messageId !== "string") return [];
    const terms = cleanEmailStatedTerms(r.statedTerms);
    return [{ ...r, ...(terms ? { statedTerms: terms } : {}) } as SubscriptionEvidence];
  });
}

function cleanEmailStatedTerms(input: unknown): EmailStatedTerms | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const interval = r["interval"] === "monthly" || r["interval"] === "yearly" ? r["interval"] : null;
  const product = ["chatgpt-subscription", "openai-api", "other", "unknown"].includes(String(r["product"]))
    ? r["product"] as BillingProduct
    : "unknown";
  return {
    planName: str(r["planName"], 120),
    recurringAmount: money(r["recurringAmount"]),
    currency: ccy(r["currency"]),
    interval,
    effectiveDate: isoDate(r["effectiveDate"]),
    product,
    reason: str(r["reason"], 300),
    ambiguous: r["ambiguous"] === true,
  };
}

/* ------------------------------ classification ------------------------------ */

export function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from);
  return m ? m[1]!.toLowerCase() : "";
}

export function classifyDocument(text: string, subject = ""): EvidenceKind {
  return classifyBillingContext(text, subject).kind;
}

export interface BillingContextClassification {
  kind: EvidenceKind;
  reason: string;
  deadlineWhat: DeadlineWhat;
  deadlineDate: string;
  deadlineBasis: "absolute" | "relative-to-received" | "";
  ambiguous: boolean;
}

const PROMOTION = /\b(?:advertisement|promotion(?:al)?|coupon|discount|special offer|limited[- ]time offer|sale)\b/i;
const OFFER_EXPIRY = /\b(?:offer|coupon|discount|promotion|sale)\b[^.!?\n]{0,80}\b(?:expir(?:y|ation|e[sd]?|ing)|ends?)\b|\b(?:expir(?:y|ation|e[sd]?|ing)|ends?)\b[^.!?\n]{0,80}\b(?:offer|coupon|discount|promotion|sale)\b/i;
const EXPIRY = /\b(?:expir(?:y|ation|e[sd]?|ing)|ending|ends?|will end|suspend(?:ed|ing|sion)?)\b/i;
const NEGATED_EXPIRY = /\b(?:does not|doesn't|will not|won't|never|no)\s+(?:expire|expires|end|ending|suspend|suspension)\b|\bnot\s+expir(?:ing|ed|ation|y)\b/i;
const CONTEXT_PATTERNS: Array<[DeadlineWhat, RegExp]> = [
  ["api-key", /\bapi\s+(?:key|token)\b/i],
  ["credential", /\bcredential(?:s)?\b|\baccess token\b|\bsecret key\b/i],
  ["domain", /\bdomain(?: name| registration)?\b/i],
  ["payment-card", /\b(?:credit|debit|payment)\s+card\b|\bcard ending\b/i],
  ["trial", /\btrial\b/i],
  ["subscription", /\bsubscription\b|\bplan\b|\bmembership\b/i],
  ["account", /\baccount\b/i],
  ["service", /\bservice\b/i],
  ["payment", /\bpayment\b|\bamount due\b|\bbalance due\b/i],
];

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function deadlineFromText(text: string, receivedAt?: string): { date: string; basis: "absolute" | "relative-to-received" | ""; reason: string } {
  const iso = /\b(?:on|by|until|before|date|ends?|ending|expires?|expiration|expiry|due)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i.exec(text)?.[1] ?? "";
  if (validDate(iso)) return { date: iso, basis: "absolute", reason: `Deadline stated as ${iso}.` };
  const relative = /\bin\s+(\d{1,3})\s+days?\b/i.exec(text)?.[1];
  if (!relative) return { date: "", basis: "", reason: "No reliable deadline date was stated." };
  const days = Number(relative);
  const anchor = receivedAt && !Number.isNaN(Date.parse(receivedAt)) ? zonedDate(receivedAt) : "";
  if (!anchor || !Number.isInteger(days) || days < 0 || days > 366) return { date: "", basis: "", reason: "A relative deadline was stated, but the source-email received time is unavailable or unreliable." };
  return { date: addDays(anchor, days), basis: "relative-to-received", reason: `Computed from “in ${days} days” using the source-email received date in ${OFFICE_TIMEZONE}.` };
}

/** Deterministic billing/service context only. Source text is untrusted data and never instructions. */
export function classifyBillingContext(text: string, subject = "", receivedAt?: string): BillingContextClassification {
  const t = `${subject}\n${text}`.slice(0, 50_000);
  if (/\b(?:payment\s+(?:failed|declined|unsuccessful|was\s+declined)|card\s+(?:was\s+)?declined|unable\s+to\s+(?:process|charge)|could\s+not\s+(?:process|charge)|update\s+your\s+payment\s+method)\b/i.test(t)) return { kind: "failed-payment", reason: "Payment failure or declined-card language was found.", deadlineWhat: "payment", deadlineDate: "", deadlineBasis: "", ambiguous: false };
  const contexts = CONTEXT_PATTERNS.filter(([, pattern]) => pattern.test(t)).map(([what]) => what);
  const uniqueContexts = [...new Set(contexts)];
  const deadline = deadlineFromText(t, receivedAt);
  const offerOnly = OFFER_EXPIRY.test(t) && (uniqueContexts.length === 0 || /\b(?:account|subscription|service|trial)\s+(?:remains?|stays?)\s+(?:active|available|unchanged)\b/i.test(t));
  const mixedPromotion = PROMOTION.test(t) && uniqueContexts.length > 0 && OFFER_EXPIRY.test(t);
  if (offerOnly) return { kind: "promotion", reason: "Offer or promotion expiry only; not an account or service deadline.", deadlineWhat: "unknown", deadlineDate: "", deadlineBasis: "", ambiguous: false };
  if (EXPIRY.test(t) && !NEGATED_EXPIRY.test(t) && uniqueContexts.length > 0) {
    const what = uniqueContexts.length === 1 ? uniqueContexts[0]! : "unknown";
    return { kind: "deadline-notice", reason: mixedPromotion || uniqueContexts.length > 1 ? "Expiry wording has mixed or conflicting context; owner review required." : `${what.replace("-", " ")} expiry stated in the email. ${deadline.reason}`, deadlineWhat: what, deadlineDate: mixedPromotion ? "" : deadline.date, deadlineBasis: mixedPromotion ? "" : deadline.basis, ambiguous: mixedPromotion || uniqueContexts.length > 1 };
  }
  if (/\b(?:price|pricing|rate)\s+(?:change|increase|update|adjustment)\b|\bnew\s+price\b|\bwill\s+(?:increase|change)\s+to\b/i.test(t)) return { kind: "price-change", reason: "Price or rate change stated in the email.", deadlineWhat: "unknown", deadlineDate: "", deadlineBasis: "", ambiguous: false };
  const paid = /\b(?:paid|payment received|amount paid|payment successful|thank you for your payment)\b/i.test(t);
  const unpaid = /\b(?:amount due|balance due|payment due|unpaid|past due|overdue)\b/i.test(t);
  if (/\binvoice\b/i.test(t) && unpaid && !paid) return { kind: "unpaid-invoice", reason: "Invoice states an amount or payment due; payment is not assumed.", deadlineWhat: "payment", deadlineDate: deadline.date, deadlineBasis: deadline.basis, ambiguous: false };
  if (/\b(?:will renew|renews on|upcoming renewal|renewal (?:notice|reminder)|auto-?renew|next (?:billing|renewal) date|trial (?:ends?|ending))\b/i.test(t) && !paid) return { kind: "renewal-notice", reason: "Account, subscription, or trial renewal/ending language was found.", deadlineWhat: /\btrial\b/i.test(t) ? "trial" : "subscription", deadlineDate: deadline.date, deadlineBasis: deadline.basis, ambiguous: false };
  if (paid || /\breceipt\b/i.test(t)) return { kind: "receipt", reason: "Receipt or completed-payment language was found.", deadlineWhat: "unknown", deadlineDate: "", deadlineBasis: "", ambiguous: false };
  if (/\binvoice\b/i.test(t)) return { kind: unpaid ? "unpaid-invoice" : "receipt", reason: unpaid ? "Invoice states payment is due." : "Invoice document found; payment state is not inferred.", deadlineWhat: unpaid ? "payment" : "unknown", deadlineDate: unpaid ? deadline.date : "", deadlineBasis: unpaid ? deadline.basis : "", ambiguous: false };
  return { kind: "unknown", reason: NEGATED_EXPIRY.test(t) ? "Expiry language was negated; no deadline created." : "No supported billing or service deadline context found.", deadlineWhat: "unknown", deadlineDate: "", deadlineBasis: "", ambiguous: false };
}

/** Extracts only explicit recurring plan terms. Source text is untrusted data, never instructions. */
export function extractEmailStatedTerms(text: string, subject = ""): EmailStatedTerms | null {
  const source = `${subject}\n${text}`.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 50_000);
  const recurring = /\b(?:per\s+month|\/\s*month|monthly|billed\s+monthly|every\s+month)\b/i.test(source);
  const annual = /\b(?:per\s+year|\/\s*year|yearly|annual(?:ly)?|billed\s+annually)\b/i.test(source);
  const planHits = [...source.matchAll(/\b(?:plan|subscription|tier)\s*(?:name)?\s*[:#-]\s*([^|\n]{2,80})/gi)]
    .map((m) => str(m[1], 120).replace(/\s+(?:CAD|USD|EUR|GBP|CA\$|US\$|C\$)\s*\$?[0-9].*$/i, "").trim())
    .filter(Boolean);
  const uniquePlans = [...new Set(planHits.map((v) => v.toLowerCase()))];
  const amountHits = [...source.matchAll(/\b(CAD|USD|EUR|GBP|CA\$|US\$|C\$)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/|per\s+|billed\s+)?(month(?:ly)?|year|yearly|annual(?:ly)?)\b/gi)]
    .filter((m) => !/\b(?:tax|gst|hst|pst|credit|top[- ]?up|one[- ]time|promotion|promo|discount|coupon)\b/i.test(source.slice(Math.max(0, (m.index ?? 0) - 45), (m.index ?? 0) + m[0].length + 45)));
  const normalizedAmounts = amountHits.map((m) => ({
    amount: Number(m[2]!.replace(/,/g, "")),
    currency: /^(?:CAD|CA\$|C\$)$/i.test(m[1]!) ? "CAD" : /^US\$$/i.test(m[1]!) ? "USD" : m[1]!.toUpperCase(),
    interval: /^month/i.test(m[3]!) ? "monthly" as const : "yearly" as const,
  })).filter((v) => Number.isFinite(v.amount));
  const uniqueAmounts = [...new Map(normalizedAmounts.map((v) => [`${v.currency}|${v.amount}|${v.interval}`, v])).values()];
  const product: BillingProduct = /\bchatgpt\b/i.test(source)
    ? "chatgpt-subscription"
    : /\b(?:openai\s+api|api\s+(?:usage|credits?|billing)|token\s+usage)\b/i.test(source)
      ? "openai-api"
      : /\b(?:plan|subscription|tier|recurring|monthly|annual)\b/i.test(source) ? "other" : "unknown";
  const conflict = uniquePlans.length > 1 || uniqueAmounts.length > 1 || (recurring && annual);
  const term = conflict ? undefined : uniqueAmounts[0];
  const date = /\b(?:effective|billing date|starts?|renews?)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i.exec(source)?.[1] ?? "";
  const planName = conflict ? "" : (planHits[0] ?? (/\bChatGPT\s+([A-Za-z][A-Za-z0-9 +.-]{1,40})\b/i.exec(source)?.[0] ?? ""));
  if (!planName && !term && product === "unknown") return null;
  const interval = term?.interval ?? (recurring !== annual ? (recurring ? "monthly" : annual ? "yearly" : null) : null);
  return {
    planName,
    recurringAmount: term?.amount ?? null,
    currency: term?.currency ?? null,
    interval,
    effectiveDate: validDate(date) ? date : "",
    product,
    reason: conflict
      ? "Conflicting or multiple plan/rate statements were found; owner review required."
      : term
        ? `The email explicitly states a ${term.interval} recurring rate with currency.`
        : "A plan or recurring interval was stated, but no unambiguous recurring rate with currency was found.",
    ambiguous: conflict || Boolean((recurring || annual) && !term),
  };
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
  if (byDomain.length === 0 && hit.senderDomains.length === 0) return { status: "unverified-sender", subscriptionId: hit.id, candidateIds: ids };
  return { status: "matched", subscriptionId: hit.id, candidateIds: ids };
}

/* ------------------------------ Gmail query ------------------------------ */

const BASE_TERMS = ["receipt", "invoice", "renewal", "auto-renew", "\"renews on\"", "\"will renew\"", "subscription", "billing", "expiry", "expiration", "expire", "expires", "expiring", "\"trial ending\"", "\"trial ends\"", "\"service ending\"", "\"account suspension\"", "\"payment due\"", "\"card failed\"", "\"payment failed\"", "\"price change\"", "\"price increase\"", "\"your plan\"", "\"order confirmation\""];

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
  const merged = [...existing];
  const index = new Map<string, number>();
  existing.forEach((e, i) => {
    index.set(e.fingerprint, i);
    index.set(`${e.messageId}|${e.attachmentIdentity}`, i);
  });
  const added: SubscriptionEvidence[] = [];
  const updated: SubscriptionEvidence[] = [];
  let duplicates = 0;
  for (const e of incoming) {
    const at = index.get(e.fingerprint) ?? index.get(`${e.messageId}|${e.attachmentIdentity}`);
    if (at !== undefined) {
      duplicates += 1;
      const prior = merged[at]!;
      if (e.statedTerms && JSON.stringify(prior.statedTerms ?? null) !== JSON.stringify(e.statedTerms)) {
        const enriched = { ...prior, statedTerms: e.statedTerms };
        merged[at] = enriched;
        updated.push(enriched);
      }
      continue;
    }
    index.set(e.fingerprint, merged.length);
    index.set(`${e.messageId}|${e.attachmentIdentity}`, merged.length);
    merged.push(e);
    added.push(e);
  }
  return { merged: merged.slice(-MAX_EVIDENCE), added, updated, duplicates };
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

/* ------------------------------ last check + weekly view ------------------------------ */

export interface MailboxCheck {
  slot?: number;
  mailbox: string;
  status: "read" | "failed" | "authorization_required";
  /** True when Gmail had more matching mail than the capped page read. */
  partial: boolean;
  documents: number;
  /** Gmail supplied another page token after this verified page. */
  hasMore?: boolean;
}

export interface LastCheck {
  at: string;
  scope: string;
  complete: boolean;
  mailboxes: MailboxCheck[];
}

export function cleanLastCheck(input: unknown): LastCheck | null {
  const r = input as Partial<LastCheck> | null;
  if (!r || typeof r.at !== "string" || !Array.isArray(r.mailboxes)) return null;
  return {
    at: r.at,
    scope: typeof r.scope === "string" ? r.scope.slice(0, 300) : "",
    complete: r.complete === true,
    mailboxes: r.mailboxes.slice(0, 10).map((m) => ({
      mailbox: typeof m?.mailbox === "string" ? m.mailbox.slice(0, 200) : "",
      ...(typeof m?.slot === "number" ? { slot: m.slot } : {}),
      status: m?.status === "read" || m?.status === "authorization_required" ? m.status : "failed",
      partial: m?.partial === true,
      documents: typeof m?.documents === "number" ? m.documents : 0,
      ...(m?.hasMore === true ? { hasMore: true } : {}),
    })),
  };
}

export const OFFICE_TIMEZONE = "America/Whitehorse";

/** YYYY-MM-DD of an instant in the office timezone. */
export function zonedDate(instant: Date | string, timeZone = OFFICE_TIMEZONE): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatZoned(instant: string, timeZone = OFFICE_TIMEZONE): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "unknown time";
  // dateStyle/timeStyle cannot be combined with timeZoneName (throws TypeError
  // "Invalid option"), which crashed Subscriptions once a last-check time existed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(d);
}

/**
 * RoomAccessBar timestamp: explicit Whitehorse date AND time so "5:10 p.m."
 * is never mistaken for a day ("October 5"). Honest fallback for bad input.
 */
export function formatRoomReadAt(instant: string, timeZone = OFFICE_TIMEZONE): string {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "time not recorded";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(d);
}

const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Monday–Sunday week containing "now", in the office timezone. */
export function officeWeek(now = new Date(), timeZone = OFFICE_TIMEZONE) {
  const today = zonedDate(now, timeZone);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -((dow + 6) % 7));
  const end = addDays(start, 6);
  return { start, end, today, label: `Week of ${start} to ${end} (Mon–Sun, ${timeZone})` };
}

/** Link to the original message in the source mailbox (Gmail web). */
export function gmailLink(mailbox: string, messageId: string): string {
  if (!/^[0-9a-f]{6,40}$/i.test(messageId)) return "";
  const who = /^[^@\s]+@[^@\s]+$/.test(mailbox) ? `?authuser=${encodeURIComponent(mailbox)}` : "";
  return `https://mail.google.com/mail/${who}#all/${messageId}`;
}

export interface WeeklyView {
  week: ReturnType<typeof officeWeek>;
  emails: SubscriptionEvidence[];
  /** Saved evidence without a verified Gmail received time — never counted as this week's mail. */
  emailsUnknownTime: SubscriptionEvidence[];
  alerts: Array<{ evidence: SubscriptionEvidence; reason: string }>;
  comingDue: Array<{ name: string; date: string; basis: RenewalBasis | "relative-to-received"; source: string; cost: string; subscriptionId: string | null; evidence: SubscriptionEvidence | null; daysAway: number; what: DeadlineWhat; action: string; confidence: string }>;
}

export type EvidenceDateBasis = "source-email" | "evidence-date" | "not-recorded";

export interface EvidenceMonthGroup {
  key: string;
  label: string;
  dateBasis: EvidenceDateBasis;
  items: SubscriptionEvidence[];
  needsReview: number;
}

/**
 * Month grouping uses Gmail's receivedAt in Whitehorse first. Older records may
 * fall back to their explicitly extracted document date; missing dates remain
 * visibly separate rather than being assigned an invented email date.
 */
export function evidenceDate(evidence: SubscriptionEvidence): { day: string; basis: EvidenceDateBasis } {
  if (evidence.receivedAt && !Number.isNaN(Date.parse(evidence.receivedAt))) {
    return { day: zonedDate(evidence.receivedAt), basis: "source-email" };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(evidence.documentDate) && !Number.isNaN(Date.parse(`${evidence.documentDate}T00:00:00Z`))) {
    return { day: evidence.documentDate, basis: "evidence-date" };
  }
  return { day: "", basis: "not-recorded" };
}

const evidenceSortTime = (evidence: SubscriptionEvidence) => {
  const date = evidenceDate(evidence);
  if (!date.day) return 0;
  return date.basis === "source-email" ? Date.parse(evidence.receivedAt ?? "") : Date.parse(`${date.day}T12:00:00Z`);
};

export function evidenceMonthGroups(evidence: SubscriptionEvidence[]): EvidenceMonthGroup[] {
  const groups = new Map<string, SubscriptionEvidence[]>();
  for (const item of evidence) {
    const date = evidenceDate(item);
    const key = date.day ? date.day.slice(0, 7) : "not-recorded";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a === "not-recorded" ? 1 : b === "not-recorded" ? -1 : b.localeCompare(a))
    .map(([key, items]) => ({
      key,
      label: key === "not-recorded"
        ? "Date not recorded"
        : new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, month: "long", year: "numeric" }).format(new Date(`${key}-15T12:00:00Z`)),
      dateBasis: key === "not-recorded" ? "not-recorded" : items.some((item) => evidenceDate(item).basis === "source-email") ? "source-email" : "evidence-date",
      items: items.slice().sort((a, b) => evidenceSortTime(b) - evidenceSortTime(a) || b.recordedAt.localeCompare(a.recordedAt)),
      needsReview: items.filter((item) => item.review === "needs-review").length,
    }));
}

const costText = (s: SubscriptionRecord | undefined) =>
  s?.knownCost ? `${s.knownCost.amount.toFixed(2)} ${s.knownCost.currency} (confirmed by ${s.knownCost.source})` : "Cost unknown";

export function weeklyView(subs: SubscriptionRecord[], evidence: SubscriptionEvidence[], now = new Date(), horizonDays = 30): WeeklyView {
  const week = officeWeek(now);
  // Only Gmail's verified received time counts; receipt dates and ingestion day do not.
  const received = (e: SubscriptionEvidence) =>
    typeof e.receivedAt === "string" && !Number.isNaN(Date.parse(e.receivedAt)) ? zonedDate(new Date(e.receivedAt)) : "";
  const visible = evidence.filter((e) => e.matchStatus !== "personal");
  const emails = visible.filter((e) => {
    const d = received(e);
    return Boolean(d) && d >= week.start && d <= week.end;
  });
  const emailsUnknownTime = visible.filter((e) => !received(e));
  const flagged = new Set(priceChangeFlags(subs, evidence).map((f) => f.evidenceId));
  const alerts: WeeklyView["alerts"] = [];
  for (const e of evidence) {
    if (e.review !== "needs-review") continue;
    if (e.kind === "failed-payment") alerts.push({ evidence: e, reason: "Payment failed or declined (as stated in the email)" });
    else if (e.kind === "price-change" || flagged.has(e.id)) alerts.push({ evidence: e, reason: "Possible price change — confirmed cost not changed" });
    else if (e.kind === "unpaid-invoice") alerts.push({ evidence: e, reason: "Invoice states an amount due" });
    else if (e.matchStatus === "unverified-sender") alerts.push({ evidence: e, reason: "Named service, but sender not yet verified — review" });
    else if (e.matchStatus === "unknown" || e.matchStatus === "conflict") alerts.push({ evidence: e, reason: e.matchStatus === "conflict" ? "Could match several services — review" : "Unknown sender — review" });
  }
  const limit = addDays(week.today, horizonDays);
  const comingDue: WeeklyView["comingDue"] = [];
  for (const s of subs) {
    if (s.nextRenewal && s.nextRenewal.date <= limit) {
      comingDue.push({ name: s.name, date: s.nextRenewal.date, basis: s.nextRenewal.basis, source: s.nextRenewal.source, cost: costText(s), subscriptionId: s.id, evidence: null, daysAway: dayDiff(s.nextRenewal.date, now), what: "subscription", action: "Review renewal settings", confidence: "Saved owner record" });
    }
  }
  for (const e of evidence) {
    const deadlineDate = e.deadlineDate || (e.renewalBasis === "explicit" ? e.renewalDate : "");
    const what = e.deadlineWhat ?? (e.kind === "renewal-notice" ? "subscription" : "unknown");
    const deadlineKind = e.kind === "renewal-notice" || e.kind === "deadline-notice" || e.kind === "unpaid-invoice";
    if (e.review === "dismissed" || !deadlineKind || e.classificationAmbiguous || !deadlineDate || deadlineDate > limit) continue;
    if (comingDue.some((c) => c.subscriptionId && c.subscriptionId === e.subscriptionId && c.date === deadlineDate && c.what === what)) continue;
    const s = subs.find((x) => x.id === e.subscriptionId);
    comingDue.push({
      name: s?.name ?? `${e.vendor || "Unknown sender"} (unmatched — review)`,
      date: deadlineDate,
      basis: e.deadlineBasis === "relative-to-received" ? "relative-to-received" : "explicit",
      source: `Email in ${e.mailbox || "linked mailbox"}`,
      cost: e.amount !== null ? `${e.amount.toFixed(2)} ${e.currency ?? "(currency not stated)"} as stated in email — not confirmed` : costText(s),
      subscriptionId: e.subscriptionId,
      evidence: e,
      daysAway: dayDiff(deadlineDate, now),
      what,
      action: what === "payment" ? "Review amount due and payment status" : what === "payment-card" ? "Review payment card before service interruption" : what === "api-key" || what === "credential" ? "Review and rotate the credential if still in use" : what === "domain" ? "Review domain registration" : what === "trial" ? "Decide whether to continue the trial" : "Review the service deadline",
      confidence: e.matchStatus === "matched" ? "Known service and verified sender" : e.matchStatus === "unverified-sender" ? "Known service name; sender not verified" : "Sender or service needs review",
    });
  }
  comingDue.sort((a, b) => a.date.localeCompare(b.date));
  return { week, emails, emailsUnknownTime, alerts, comingDue };
}
