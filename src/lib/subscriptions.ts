/**
 * Office subscriptions and billing evidence — pure, testable rules.
 */

export type SubscriptionScope = "office" | "personal" | "unknown";
export type RenewalBasis = "explicit" | "estimated";
export type EvidenceKind = "receipt" | "unpaid-invoice" | "renewal-notice" | "deadline-notice" | "promotion" | "price-change" | "failed-payment" | "unknown";
export type DeadlineWhat = "subscription" | "trial" | "service" | "account" | "domain" | "api-key" | "credential" | "payment-card" | "payment" | "unknown";
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
  aliases: string[];
  senderDomains: string[];
  scope: SubscriptionScope;
  cadence: "monthly" | "yearly" | "other" | "unknown";
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
  renewalBasis: "explicit" | "";
  mailbox: string;
  messageId: string;
  attachmentIdentity: string;
  from: string;
  subject: string;
  fingerprint: string;
  receivedAt?: string;
  recordedAt: string;
  review: "needs-review" | "reviewed" | "dismissed";
  classificationReason?: string;
  deadlineWhat?: DeadlineWhat;
  deadlineDate?: string;
  deadlineBasis?: "absolute" | "relative-to-received";
  classificationAmbiguous?: boolean;
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

export const STARTER_SUBSCRIPTIONS: SubscriptionRecord[] = [
  starter("lovable", "Lovable", ["lovable"], ["lovable.dev"], "Development platform"),
  starter("supabase", "Supabase", ["supabase"], ["supabase.com", "supabase.io"], "CanX-owned database and sign-in"),
  starter("openai", "OpenAI", ["openai", "chatgpt"], ["openai.com"], "AI workers"),
  starter("anthropic", "Anthropic (Claude)", ["anthropic", "claude"], ["anthropic.com"], "Second Eyes reviewer"),
  starter("github", "GitHub", ["github"], ["github.com"], "Code hosting"),
  starter("sintra-ai", "Sintra AI", ["sintra ai", "sintra"], [], "Usage confirmed by John on 2026-10-03."),
];

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
  return {
    id: str(r["id"], 60) || `s-${Date.now().toString(36)}`,
    name,
    planName: str(r["planName"], 120),
    aliases: list(r["aliases"], 12),
    senderDomains: list(r["senderDomains"], 12).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    scope: r["scope"] === "office" || r["scope"] === "personal" ? r["scope"] : "unknown",
    cadence: ["monthly", "yearly", "other"].includes(String(r["cadence"])) ? (r["cadence"] as SubscriptionRecord["cadence"]) : "unknown",
    knownCost: amount !== null && currency ? { amount, currency, asOf: isoDate(cost?.["asOf"]), source: str(cost?.["source"], 200) || "John" } : null,
    nextRenewal: renewalDate ? { date: renewalDate, basis: renewal?.["basis"] === "explicit" ? "explicit" : "estimated", source: str(renewal?.["source"], 200) || "John" } : null,
    history: Array.isArray(r["history"]) ? (r["history"] as unknown[]).slice(0, 120).flatMap((h) => {
      const e = (h ?? {}) as Record<string, unknown>;
      const date = isoDate(e["date"]);
      return date ? [{ date, amount: money(e["amount"]), currency: ccy(e["currency"]), source: str(e["source"], 200) }] : [];
    }) : [],
    notes: str(r["notes"], 1000),
    updatedAt: str(r["updatedAt"], 40),
  };
}

export function cleanSubscriptionList(input: unknown): SubscriptionRecord[] | null {
  if (!Array.isArray(input) || input.length > MAX_SUBSCRIPTIONS) return null;
  return input.map(cleanSubscription).filter((s): s is SubscriptionRecord => s !== null);
}

export function cleanEvidenceList(input: unknown): SubscriptionEvidence[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_EVIDENCE).flatMap((e) => {
    const r = e as Partial<SubscriptionEvidence>;
    if (typeof r?.id !== "string" || typeof r.kind !== "string" || typeof r.messageId !== "string") return [];
    if (!r.statedTerms) return [r as SubscriptionEvidence];
    const t = r.statedTerms as EmailStatedTerms;
    return [{ ...r, statedTerms: {
      planName: str(t.planName, 120), recurringAmount: money(t.recurringAmount), currency: ccy(t.currency),
      interval: t.interval === "monthly" || t.interval === "yearly" ? t.interval : null,
      effectiveDate: isoDate(t.effectiveDate),
      product: ["chatgpt-subscription", "openai-api", "other", "unknown"].includes(t.product) ? t.product : "unknown",
      reason: str(t.reason, 300), ambiguous: t.ambiguous === true,
    } } as SubscriptionEvidence];
  });
}

export function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from);
  return m ? m[1]!.toLowerCase() : "";
}

export function classifyDocument(text: string, subject = ""): EvidenceKind {
  return classifyBillingContext(text, subject).kind;
}

export function classifyBillingContext(text: string, subject = "", receivedAt?: string) {
  const t = `${subject}\n${text}`.slice(0, 50_000);
  const promotion = /\b(?:promotion|coupon|discount|special offer|sale)\b/i.test(t);
  const expiry = /\b(?:expir(?:y|ation|e[sd]?|ing)|ending|ends?|suspension)\b/i.test(t);
  const what: DeadlineWhat = /\bapi\s+(?:key|token)\b/i.test(t) ? "api-key" : /\bcredential|access token|secret key\b/i.test(t) ? "credential" : /\bdomain\b/i.test(t) ? "domain" : /\btrial\b/i.test(t) ? "trial" : /\baccount\b/i.test(t) ? "account" : /\bsubscription|plan|membership\b/i.test(t) ? "subscription" : /\bservice\b/i.test(t) ? "service" : "unknown";
  let deadlineDate = /\b(?:on|by|until|before|ends?|expires?|expiry|due)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i.exec(t)?.[1] ?? "";
  let deadlineBasis: "absolute" | "relative-to-received" | "" = deadlineDate ? "absolute" : "";
  const relative = /\bin\s+(\d{1,3})\s+days?\b/i.exec(t);
  if (!deadlineDate && relative && receivedAt && !Number.isNaN(Date.parse(receivedAt))) {
    deadlineDate = addDays(zonedDate(receivedAt), Number(relative[1])); deadlineBasis = "relative-to-received";
  }
  if (promotion && expiry) return { kind: "promotion" as const, reason: "Offer or promotion expiry only; not an account or service deadline.", deadlineWhat: "unknown" as const, deadlineDate: "", deadlineBasis: "" as const, ambiguous: false };
  if (expiry && what !== "unknown" && !/\b(?:does not|doesn't|will not|won't|never)\s+(?:expire|end)\b/i.test(t)) return { kind: "deadline-notice" as const, reason: `${what.replace("-", " ")} expiry stated in the email.`, deadlineWhat: what, deadlineDate, deadlineBasis, ambiguous: false };
  if (/\b(?:payment failed|card declined|unable to charge|update your payment method)\b/i.test(t)) return { kind: "failed-payment" as const, reason: "Payment failure stated.", deadlineWhat: "payment" as const, deadlineDate: "", deadlineBasis: "" as const, ambiguous: false };
  if (/\b(?:price|rate)\s+(?:change|increase)|new price|will increase to\b/i.test(t)) return { kind: "price-change" as const, reason: "Price change stated.", deadlineWhat: "unknown" as const, deadlineDate: "", deadlineBasis: "" as const, ambiguous: false };
  const paid = /\b(?:paid|payment received|amount paid|payment successful)\b/i.test(t);
  const due = /\b(?:amount due|balance due|payment due|unpaid|overdue)\b/i.test(t);
  if (/\binvoice\b/i.test(t) && due && !paid) return { kind: "unpaid-invoice" as const, reason: "Invoice states payment due.", deadlineWhat: "payment" as const, deadlineDate, deadlineBasis, ambiguous: false };
  if (/\b(?:will renew|renews on|renewal notice|auto-?renew|trial ends?)\b/i.test(t) && !paid) return { kind: "renewal-notice" as const, reason: "Renewal stated.", deadlineWhat: /trial/i.test(t) ? "trial" as const : "subscription" as const, deadlineDate, deadlineBasis, ambiguous: false };
  if (paid || /\breceipt\b/i.test(t) || /\binvoice\b/i.test(t)) return { kind: "receipt" as const, reason: "Receipt or invoice document found; payment is not inferred without explicit language.", deadlineWhat: "unknown" as const, deadlineDate: "", deadlineBasis: "" as const, ambiguous: false };
  return { kind: "unknown" as const, reason: "No supported billing context found.", deadlineWhat: "unknown" as const, deadlineDate: "", deadlineBasis: "" as const, ambiguous: false };
}

export function matchService(from: string, text: string, subscriptions: SubscriptionRecord[]) {
  const domain = senderDomain(from);
  const byDomain = subscriptions.filter((s) => s.senderDomains.some((d) => domain === d || domain.endsWith(`.${d}`)));
  const lower = `${from}\n${text}`.toLowerCase();
  const byAlias = subscriptions.filter((s) => [s.name.toLowerCase(), ...s.aliases].some((a) => a.length >= 3 && lower.includes(a)));
  const hits = byDomain.length ? byDomain : byAlias;
  const ids = [...new Set(hits.map((s) => s.id))];
  if (!ids.length) return { status: "unknown" as const, subscriptionId: null, candidateIds: [] };
  if (ids.length > 1) return { status: "conflict" as const, subscriptionId: null, candidateIds: ids };
  const hit = hits[0]!;
  if (hit.scope === "personal") return { status: "personal" as const, subscriptionId: hit.id, candidateIds: ids };
  if (hit.scope !== "office") return { status: "conflict" as const, subscriptionId: null, candidateIds: ids };
  return { status: byDomain.length ? "matched" as const : "unverified-sender" as const, subscriptionId: hit.id, candidateIds: ids };
}

export function buildGmailQuery(subscriptions: SubscriptionRecord[]) {
  const terms = ["receipt", "invoice", "renewal", "billing", "expiry", "expiration", "auto-renew", '"trial ending"', '"account suspension"', '"payment failed"', '"price change"', '"your plan"'];
  for (const s of subscriptions) { for (const d of s.senderDomains) terms.push(`from:${d}`); for (const a of s.aliases) terms.push(a.includes(" ") ? `"${a}"` : a); }
  return `(${[...new Set(terms)].join(" OR ")}) newer_than:1y -in:spam -in:trash`;
}

export function extractEmailStatedTerms(text: string, subject = ""): EmailStatedTerms | null {
  const source = `${subject}\n${text}`.slice(0, 50_000);
  if (/\b(?:credit|top[- ]?up|one[- ]time)\b/i.test(source) && !/\b(?:subscription|plan)\b/i.test(source)) return null;
  const monthly = /\b(?:per month|monthly|billed monthly)\b/i.test(source), yearly = /\b(?:per year|yearly|annual(?:ly)?|billed annually)\b/i.test(source);
  const plans = [...source.matchAll(/\b(?:plan|subscription|tier)\s*(?:name)?\s*[:#-]\s*([^\n]{2,80})/gi)].map((m) => str(m[1], 120).replace(/\s+(?:CAD|USD|EUR|GBP)\s*\$?[0-9].*$/i, ""));
  const values = [...source.matchAll(/\b(CAD|USD|EUR|GBP)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/|per\s+|billed\s+)?(month(?:ly)?|year|yearly|annual(?:ly)?)\b/gi)].map((m) => ({ currency: m[1]!.toUpperCase(), amount: Number(m[2]!.replace(/,/g, "")), interval: /^month/i.test(m[3]!) ? "monthly" as const : "yearly" as const }));
  const conflict = new Set(values.map((v) => JSON.stringify(v))).size > 1 || new Set(plans.map((p) => p.toLowerCase())).size > 1 || (monthly && yearly);
  const value = conflict ? undefined : values[0];
  const product: BillingProduct = /chatgpt/i.test(source) ? "chatgpt-subscription" : /openai\s+api|api\s+(?:usage|credit)/i.test(source) ? "openai-api" : /plan|subscription|monthly|annual/i.test(source) ? "other" : "unknown";
  const inlinePlan = /\b(ChatGPT\s+[A-Za-z0-9+.-]+)\s+plan\b/i.exec(source)?.[1] ?? "";
  if (!plans[0] && !inlinePlan && !value && product === "unknown") return null;
  return { planName: conflict ? "" : plans[0] ?? inlinePlan, recurringAmount: value?.amount ?? null, currency: value?.currency ?? null, interval: value?.interval ?? (monthly !== yearly ? monthly ? "monthly" : yearly ? "yearly" : null : null), effectiveDate: /\b(?:effective|billing date)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})\b/i.exec(source)?.[1] ?? "", product, reason: conflict ? "Conflicting plan or rate statements require review." : value ? "Email explicitly states a recurring rate and currency." : "Plan terms found without an unambiguous recurring rate.", ambiguous: conflict || Boolean((monthly || yearly) && !value) };
}

export function mergeEvidence(existing: SubscriptionEvidence[], incoming: SubscriptionEvidence[]) {
  const merged = [...existing], added: SubscriptionEvidence[] = [], updated: SubscriptionEvidence[] = [];
  let duplicates = 0;
  for (const e of incoming) {
    const at = merged.findIndex((x) => x.fingerprint === e.fingerprint || (x.messageId === e.messageId && x.attachmentIdentity === e.attachmentIdentity));
    if (at < 0) { merged.push(e); added.push(e); continue; }
    duplicates++;
    if (e.statedTerms && !merged[at]!.statedTerms) { merged[at] = { ...merged[at]!, statedTerms: e.statedTerms }; updated.push(merged[at]!); }
  }
  return { merged: merged.slice(-MAX_EVIDENCE), added, updated, duplicates };
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

export const OFFICE_TIMEZONE = "America/Whitehorse";

export function zonedDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function formatZoned(iso: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatRoomReadAt(iso: string) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "time not recorded";
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(iso)).replace(" a.m.", " a.m.").replace(" p.m.", " p.m.");
}

export function evidenceDate(e: SubscriptionEvidence): { day: string; basis: "source-email" | "evidence-date" | "none" } {
  if (e.receivedAt) return { day: zonedDate(e.receivedAt), basis: "source-email" };
  if (e.documentDate) return { day: e.documentDate, basis: "evidence-date" };
  return { day: "", basis: "none" };
}

export function evidenceMonthGroups(evidence: SubscriptionEvidence[]) {
  const groups: Record<string, { key: string; label: string; items: SubscriptionEvidence[]; needsReview: number; dateBasis: "source-email" | "evidence-date" | "not-recorded" }> = {};
  for (const e of evidence) {
    const d = evidenceDate(e);
    const key = d.day ? d.day.slice(0, 7) : "not-recorded";
    if (!groups[key]) {
      const label = key === "not-recorded" ? "Date not recorded" : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00Z`));
      groups[key] = { key, label, items: [], needsReview: 0, dateBasis: d.basis };
    }
    groups[key]!.items.push(e);
    if (e.review === "needs-review") groups[key]!.needsReview += 1;
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
}

export function gmailLink(mailbox: string, messageId: string) {
  if (!mailbox || !/^[a-z0-9._%+-]+@[a-z0-9.-]+$/i.test(mailbox) || !/^[a-z0-9]+$/i.test(messageId)) return "";
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${messageId}`;
}

export interface RenewalWarning {
  subscriptionId: string | null;
  name: string;
  date: string;
  daysAway: number;
  basis: RenewalBasis;
  source: string;
}

export function renewalWarnings(subscriptions: SubscriptionRecord[], evidence: SubscriptionEvidence[], at = new Date()): RenewalWarning[] {
  const now = at;
  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAway = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const out: RenewalWarning[] = [];
  for (const s of subscriptions) {
    if (s.nextRenewal && s.nextRenewal.date >= todayStr && s.nextRenewal.date <= sevenDaysAway) {
      out.push({
        subscriptionId: s.id,
        name: s.name,
        date: s.nextRenewal.date,
        daysAway: Math.floor((new Date(s.nextRenewal.date).getTime() - new Date(todayStr).getTime()) / (24 * 60 * 60 * 1000)),
        basis: s.nextRenewal.basis,
        source: s.nextRenewal.source,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function priceChangeFlags(subscriptions: SubscriptionRecord[], evidence: SubscriptionEvidence[]) {
  const out: Array<{ subscriptionId: string; evidenceId: string; name: string; confirmed: { amount: number; currency: string }; seen: { amount: number; currency: string } }> = [];
  for (const e of evidence) {
    if (e.review !== "needs-review" || !e.subscriptionId || e.amount === null || !e.currency) continue;
    const s = subscriptions.find((x) => x.id === e.subscriptionId);
    if (!s || !s.knownCost || (s.knownCost.amount === e.amount && s.knownCost.currency === e.currency)) continue;
    out.push({
      subscriptionId: s.id,
      evidenceId: e.id,
      name: s.name,
      confirmed: { amount: s.knownCost.amount, currency: s.knownCost.currency },
      seen: { amount: e.amount, currency: e.currency },
    });
  }
  return out;
}

export interface WeeklyView {
  week: { label: string; start: string; end: string };
  emails: SubscriptionEvidence[];
  emailsUnknownTime: SubscriptionEvidence[];
  comingDue: Array<{ name: string; date: string; daysAway: number; what: DeadlineWhat; basis: string; action: string; confidence: string; cost: string; evidence: SubscriptionEvidence | null; source: string }>;
  alerts: Array<{ evidence: SubscriptionEvidence; reason: string }>;
}

export function weeklyView(subscriptions: SubscriptionRecord[], evidence: SubscriptionEvidence[]): WeeklyView {
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);
  const label = "Recent week";
  const emails = evidence.filter((e) => e.receivedAt && e.receivedAt.slice(0, 10) >= startStr && e.receivedAt.slice(0, 10) <= endStr);
  return {
    week: { label, start: startStr, end: endStr },
    emails: emails.sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || "")),
    emailsUnknownTime: evidence.filter((e) => !e.receivedAt),
    comingDue: [],
    alerts: [],
  };
}

export interface LastCheck {
  at: string;
  scope: string;
  complete: boolean;
  mailboxes: Array<{ mailbox: string; status: "read" | "authorization_required" | "failed"; documents: number; partial: boolean }>;
}
