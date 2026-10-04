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
  return input.slice(0, MAX_EVIDENCE).filter((e): e is SubscriptionEvidence => {
    const r = e as Partial<SubscriptionEvidence>;
    return typeof r?.id === "string" && typeof r.kind === "string" && typeof r.messageId === "string";
  });
}

export function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from);
  return m ? m[1]!.toLowerCase() : "";
}

export const OFFICE_TIMEZONE = "America/Whitehorse";

export function zonedDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function formatZoned(iso: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: OFFICE_TIMEZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function evidenceDate(e: SubscriptionEvidence): { day: string; basis: "source-email" | "evidence-date" | "none" } {
  if (e.receivedAt) return { day: zonedDate(e.receivedAt), basis: "source-email" };
  if (e.documentDate) return { day: e.documentDate, basis: "evidence-date" };
  return { day: "", basis: "none" };
}

export function evidenceMonthGroups(evidence: SubscriptionEvidence[]) {
  const groups: Record<string, { key: string; label: string; items: SubscriptionEvidence[]; needsReview: number; dateBasis: "source-email" | "evidence-date" }> = {};
  for (const e of evidence) {
    const d = evidenceDate(e);
    const key = d.day ? d.day.slice(0, 7) : "not-recorded";
    if (!groups[key]) {
      const label = key === "not-recorded" ? "Date not recorded" : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00Z`));
      groups[key] = { key, label, items: [], needsReview: 0, dateBasis: d.basis === "source-email" ? "source-email" : "evidence-date" };
    }
    groups[key]!.items.push(e);
    if (e.review === "needs-review") groups[key]!.needsReview += 1;
  }
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
}

export function gmailLink(mailbox: string, messageId: string) {
  if (!mailbox || !messageId) return "";
  return `https://mail.google.com/mail/u/${mailbox}/#all/${messageId}`;
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
