/**
 * Analytics Control Room measurements — CLIENT-SAFE, PURE.
 *
 * The server reader (analytics-overview.server.ts) collects raw, owner-scoped
 * reads; this module turns them into the ten Analytics cards that John sees
 * and Elsie explains. Nothing here reads data, guesses or fills gaps:
 *  - a source that was not read shows "Could not be read", "Not connected",
 *    "Not measured", "Needs two-step sign-in" or "Awaiting verification",
 *    never zero;
 *  - policy limits (C$500 Office ceiling, C$100 Manager AI allocation, the
 *    US$2 Claude build cap) are labelled "Policy limit", never spending;
 *  - the Office AI meter records ESTIMATED cents, so it is labelled "Estimate".
 * Every metric carries its source and the time it was read.
 */

import { totalsByCurrency, type FinanceReceipt } from "./finance-receipts";
import { RUNNING_COST_CEILING, RUNNING_COST_CURRENCY } from "./office-budget";
import type { SubscriptionRecord } from "./subscriptions";

export const ANALYTICS_CONTRACT = "canx-analytics/1";
export const OFFICE_TIMEZONE = "America/Whitehorse";
/** John's Manager AI allocation (policy). The database meter's ceiling is set separately in cents. */
export const MANAGER_AI_ALLOCATION_CAD = 100;
/** Claude builder per-build cap (policy, from claude-builds.server.ts). */
export const CLAUDE_BUILD_CAP_USD = 2;
export const STALE_TASK_DAYS = 14;
export const RENEWAL_WINDOW_DAYS = 30;

export type MetricState =
  | "live" | "estimate" | "policy" | "not-connected" | "not-measured" | "awaiting-verification" | "needs-two-step" | "failed";

export const STATE_LABEL: Record<MetricState, string> = {
  live: "Live",
  estimate: "Estimate",
  policy: "Policy limit",
  "not-connected": "Not connected",
  "not-measured": "Not measured",
  "awaiting-verification": "Awaiting verification",
  "needs-two-step": "Needs two-step sign-in",
  failed: "Could not be read",
};

/** States whose value is a real reading (live or a labelled estimate from real records). */
export const MEASURED_STATES: MetricState[] = ["live", "estimate"];

export type Tone = "good" | "warn" | "alert" | "neutral";
export type Accent = "blue" | "lime" | "orange";

export interface Metric {
  label: string;
  /** null whenever the state is not a reading — the UI then shows the state label instead. */
  value: string | null;
  state: MetricState;
  source: string;
  updatedAt: string | null;
  tone: Tone;
  note?: string;
}

export interface SeriesPoint { label: string; value: number }
export interface Series {
  label: string;
  unit: string;
  points: SeriesPoint[];
  state: MetricState;
  source: string;
  updatedAt: string | null;
  accent: Accent;
}

export interface ListItem { label: string; detail: string; tone: Tone }

export type CardId = "health" | "money" | "api" | "builders" | "sources" | "projects" | "time" | "bottlenecks" | "actions" | "security";
export const CARD_ORDER: CardId[] = ["health", "money", "api", "builders", "sources", "projects", "time", "bottlenecks", "actions", "security"];

export interface AnalyticsCard {
  id: CardId;
  title: string;
  subtitle: string;
  accent: Accent;
  headline: Metric;
  metrics: Metric[];
  series: Series[];
  items: ListItem[];
  /** Plain-language things that need attention, derived only from the readings above. */
  attention: string[];
  recommendation: string;
}

export type SourceStatus = "read" | "failed" | "denied" | "not-configured";
export interface SourceCheck { key: string; label: string; status: SourceStatus; detail: string }

export interface AnalyticsOverview {
  contract: typeof ANALYTICS_CONTRACT;
  checkedAt: string;
  signIn: "two-step" | "one-step" | "viewer" | "unknown";
  sources: SourceCheck[];
  cards: AnalyticsCard[];
}

/* ------------------------------- raw inputs ------------------------------- */

export type Read<T> =
  | { status: "read"; at: string; data: T }
  | { status: "failed" | "denied" | "not-configured"; detail: string };

export type Row = Record<string, unknown>;

export interface BuildRun {
  id: number;
  /** success | failure | cancelled | skipped | in_progress | queued | … */
  state: string;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string | null;
  title: string;
}

export interface BudgetStatus { usedCents: number; ceilingCents: number; warnCents: number; paused: boolean; warning: boolean }
export interface UsageRow { at: string; cents: number; outcome: string }
export interface FinanceData { receipts: FinanceReceipt[]; subscriptions: SubscriptionRecord[]; updatedAt: string | null; partial?: string }
export interface ProjectRow { name: string; stage: string; nextMove: string }

export interface AnalyticsRaw {
  now: Date;
  aal: string;
  tasks: Read<Row[]>;
  approvals: Read<Row[]>;
  changes: Read<Row[]>;
  budget: Read<BudgetStatus>;
  usage: Read<UsageRow[]>;
  finance: Read<FinanceData>;
  builds: { codex: Read<BuildRun[]>; claude: Read<BuildRun[]> };
  projects: Read<ProjectRow[]>;
}

/* ------------------------------- helpers ------------------------------- */

const SRC = {
  tasks: "Work Board tasks (owner database)",
  approvals: "Approval box (owner database)",
  changes: "Office change log (owner database)",
  budget: "Office AI budget meter (database function manager_budget_status)",
  usage: "Office AI call log (owner database)",
  finance: "Finance receipts and subscriptions (owner-only, two-step)",
  codex: "GitHub runs of the Office Codex builder (canx-codex.yml)",
  claude: "GitHub runs of the Office Claude builder (canx-claude.yml)",
  projects: "Project register (owner-only, two-step)",
  policy: "John's recorded policy (written into the app)",
  device: "Build & Testing room checks (recorded on John's device)",
} as const;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const DAY = 86_400_000;
const daysBetween = (from: string, now: Date) => {
  const t = Date.parse(from);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY)) : null;
};
const minutesBetween = (a: string | null, b: string | null) => {
  const x = a ? Date.parse(a) : NaN, y = b ? Date.parse(b) : NaN;
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? (y - x) / 60_000 : null;
};
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
const money = (amount: number, currency: string) =>
  `${currency === "CAD" ? "C$" : currency === "USD" ? "US$" : `${currency} `}${amount.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const zonedMonth = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIMEZONE, year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
const utcMonthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** A metric for a source that could not give a reading. Value is always null. */
function missing(label: string, read: { status: string; detail?: string }, source: string, note?: string): Metric {
  const state: MetricState = read.status === "denied" ? "needs-two-step" : read.status === "not-configured" ? "not-connected" : "failed";
  const detail = "detail" in read && read.detail ? read.detail : "";
  return { label, value: null, state, source, updatedAt: null, tone: "warn", ...(note || detail ? { note: note ?? detail } : {}) };
}
const policy = (label: string, value: string, note: string): Metric => ({ label, value, state: "policy", source: SRC.policy, updatedAt: null, tone: "neutral", note });
const unmeasured = (label: string, note: string, state: MetricState = "not-measured", source = "No Office record collects this yet"): Metric =>
  ({ label, value: null, state, source, updatedAt: null, tone: "neutral", note });
const live = (label: string, value: string, source: string, at: string, tone: Tone = "neutral", note?: string, state: MetricState = "live"): Metric =>
  ({ label, value, state, source, updatedAt: at, tone, ...(note ? { note } : {}) });

/* ------------------------------- task helpers ------------------------------- */

export interface TaskView {
  id: string; title: string; status: string; risk: string; project: string; worker: string;
  waitingReason: string; createdAt: string; updatedAt: string; evidence: string;
}
export function taskView(r: Row): TaskView {
  return {
    id: str(r["id"], 80), title: str(r["title"], 120), status: str(r["status"], 20) || "unknown", risk: str(r["risk"], 10),
    project: str(r["project"], 80), worker: str(r["worker"], 60), waitingReason: str(r["waiting_reason"], 200),
    createdAt: str(r["created_at"], 40), updatedAt: str(r["updated_at"], 40), evidence: typeof r["evidence"] === "string" ? (r["evidence"] as string).slice(0, 4000) : "",
  };
}
const ACTIVE = new Set(["open", "in_progress", "waiting"]);

/** Work Board build receipt (office-task-v2 / legacy codex-task-v1) parsed from task evidence. */
export interface TaskBuildLink { taskId: string; builder: "claude" | "codex"; runId: number | null; state: string; queuedByElsie: boolean }
export function taskBuildLink(t: TaskView): TaskBuildLink | null {
  const first = t.evidence.trim();
  if (first.startsWith("{")) {
    const end = first.indexOf("\n");
    try {
      const v = JSON.parse(end > 0 ? first.slice(0, end) : first) as Row;
      if (v["kind"] !== "office-task-v2" && v["kind"] !== "codex-task-v1") return null;
      const runId = typeof v["runId"] === "number" && Number.isSafeInteger(v["runId"]) ? v["runId"] as number : null;
      return {
        taskId: t.id, builder: v["kind"] === "office-task-v2" && v["builder"] === "claude" ? "claude" : "codex", runId,
        state: str(v["state"], 40) || "unknown", queuedByElsie: str(v["prior"], 400).includes("[elsie-queue"),
      };
    } catch { /* not a receipt */ }
  }
  // Elsie's create_task path writes a plain "Codex handoff <time>: …" line when it sends green code work.
  if (/^Codex handoff \d{4}-\d{2}-\d{2}T/.test(first)) return { taskId: t.id, builder: "codex", runId: null, state: /not confirmed/i.test(first) ? "submission_unconfirmed" : "unknown", queuedByElsie: false };
  return null;
}

/* ------------------------------- cards ------------------------------- */

function readOk<T>(r: Read<T>): r is { status: "read"; at: string; data: T } { return r.status === "read"; }

function healthCard(raw: AnalyticsRaw, checks: SourceCheck[]): AnalyticsCard {
  const read = checks.filter((c) => c.status === "read").length;
  const notConfigured = checks.filter((c) => c.status === "not-configured").length;
  const denied = checks.filter((c) => c.status === "denied").length;
  const failed = checks.filter((c) => c.status === "failed");
  const reachable = checks.length - notConfigured - denied;
  const at = raw.now.toISOString();
  const tone: Tone = failed.length === 0 && read > 0 ? (denied || notConfigured ? "warn" : "good") : read === 0 ? "alert" : "warn";
  const headline = live("Office data connections", `${read} of ${checks.length} sources read just now`, "This Analytics read (every source tried just now)", at, tone,
    reachable === read ? undefined : `${failed.length} failed`);
  const metrics: Metric[] = checks.map((c) => c.status === "read"
    ? live(c.label, "Read OK", c.label, at, "good")
    : { label: c.label, value: null, state: c.status === "denied" ? "needs-two-step" : c.status === "not-configured" ? "not-connected" : "failed", source: c.label, updatedAt: null, tone: c.status === "failed" ? "alert" : "warn", note: c.detail });
  let failures: Metric;
  if (readOk(raw.usage)) {
    const monthStart = utcMonthStart(raw.now).getTime();
    const month = raw.usage.data.filter((u) => Date.parse(u.at) >= monthStart);
    const bad = month.filter((u) => u.outcome === "failed").length;
    failures = live("Office AI calls that failed this month", `${bad} of ${month.length}`, SRC.usage, raw.usage.at, bad ? "warn" : "good", "Calendar month in UTC, the same month the budget meter uses.");
  } else failures = missing("Office AI calls that failed this month", raw.usage, SRC.usage);
  const verification = unmeasured("Signed-in room check after the latest update", "Recorded on John's device in Build & Testing; this server read cannot see it. The room shows this device's result when one exists.", "awaiting-verification", SRC.device);
  const attention: string[] = [
    ...failed.map((c) => `${c.label} could not be read just now (${c.detail || "no detail"}).`),
    ...(denied ? [`${plural(denied, "source")} need${denied === 1 ? "s" : ""} two-step sign-in before the numbers can be shown.`] : []),
    ...(notConfigured ? [`${plural(notConfigured, "source")} ${notConfigured === 1 ? "is" : "are"} not connected on the Office server.`] : []),
  ];
  return {
    id: "health", title: "Overall Office Health", subtitle: "Connections, failures, last check", accent: "lime",
    headline, metrics: [failures, verification, ...metrics], series: [], items: [], attention,
    recommendation: failed.length
      ? "Press Refresh once. If the same source still fails, ask Elsie to open a Work Board task naming that source; do not retry builds because of it."
      : denied ? "Enter your authenticator code so the protected numbers can be read." : "Nothing is broken in this read. Run the Build & Testing room check after each update so the last verification stays current.",
  };
}

function moneyCard(raw: AnalyticsRaw): AnalyticsCard {
  const ceiling = policy("Office monthly running-cost ceiling", money(RUNNING_COST_CEILING, RUNNING_COST_CURRENCY), "A ceiling for all running costs together, not money to spend and not a balance. Lovable build credits are separate.");
  const managerAi = policy("Manager AI allocation", money(MANAGER_AI_ALLOCATION_CAD, "CAD"), "Part of the C$500 ceiling set aside for Elsie's own AI calls.");
  const lovable = unmeasured("Lovable build credits", "Lovable billing is not connected to the Office.", "not-connected", "Lovable account (not connected)");
  if (!readOk(raw.finance)) {
    const m = missing("Receipts filed this month", raw.finance, SRC.finance);
    return {
      id: "money", title: "Money and Budgets", subtitle: "Expenses, subscriptions, budgets", accent: "orange", headline: m,
      metrics: [ceiling, managerAi, missing("Subscriptions with confirmed prices", raw.finance, SRC.finance), lovable], series: [], items: [],
      attention: [raw.finance.status === "denied" ? "Money numbers are hidden until you enter your authenticator code." : "Finance could not be read just now, so no spending is shown."],
      recommendation: raw.finance.status === "denied" ? "Enter your authenticator code, then refresh this room." : "Refresh once; if Finance still cannot be read, open the Finance room to see its own message.",
    };
  }
  const { receipts, subscriptions, updatedAt } = raw.finance.data;
  const at = raw.finance.at;
  const thisMonth = zonedMonth(raw.now);
  const kept = receipts.filter((r) => r.reviewStatus !== "excluded");
  const monthReceipts = kept.filter((r) => r.date.slice(0, 7) === thisMonth);
  const totals = totalsByCurrency(monthReceipts);
  const cad = totals.find((t) => t.currency === "CAD");
  const other = totals.filter((t) => t.currency !== "CAD");
  const fmtTotals = totals.map((t) => (t.total === null ? `${t.currency}: ${plural(t.count, "receipt")}, total incomplete` : `${money(t.total, t.currency)} (${plural(t.count, "receipt")})`)).join(" · ");
  const headline = live("Receipts filed this month", monthReceipts.length ? fmtTotals : "No receipts filed yet this month", SRC.finance, at, "neutral",
    `Month ${thisMonth} in Whitehorse time. Receipt totals as filed; not tax-adjusted. Currencies are never added together.${updatedAt ? ` Finance last saved ${updatedAt}.` : ""}${raw.finance.data.partial ? ` ${raw.finance.data.partial}` : ""}`);
  const metrics: Metric[] = [headline, ceiling, managerAi];
  if (cad && cad.total !== null && other.length === 0) {
    const left = RUNNING_COST_CEILING - cad.total;
    metrics.push(live("Room left under the C$500 ceiling (receipts only)", money(left, "CAD"), `${SRC.finance} compared with ${SRC.policy}`, at, left < 0 ? "alert" : left < 100 ? "warn" : "good",
      "Only counts receipts filed so far. Costs without a filed receipt are not included, so the real figure may be lower.", "estimate"));
  } else metrics.push(unmeasured("Room left under the C$500 ceiling", other.length ? "This month has receipts in more than one currency; they are never converted or added." : "No complete CAD receipt total this month yet.", "not-measured", SRC.finance));
  const office = subscriptions.filter((s) => s.scope !== "personal");
  const priced = office.filter((s) => s.knownCost && Number.isFinite(s.knownCost.amount) && /^[A-Z]{3}$/.test(s.knownCost.currency));
  const monthly = new Map<string, { amount: number; estimated: boolean }>();
  for (const s of priced) {
    const c = s.knownCost!;
    if (s.cadence !== "monthly" && s.cadence !== "yearly") continue;
    const cur = monthly.get(c.currency) ?? { amount: 0, estimated: false };
    cur.amount += s.cadence === "yearly" ? c.amount / 12 : c.amount;
    cur.estimated ||= s.cadence === "yearly";
    monthly.set(c.currency, cur);
  }
  metrics.push(monthly.size
    ? live("Subscriptions per month (owner-confirmed prices)", [...monthly.entries()].map(([cur, v]) => money(v.amount, cur)).join(" · "), SRC.finance, at, "neutral",
      `${plural(priced.length, "service")} with a confirmed price out of ${office.length} saved. Yearly plans are divided by 12.`, [...monthly.values()].some((v) => v.estimated) ? "estimate" : "live")
    : unmeasured("Subscriptions per month", `${office.length} saved services, none with an owner-confirmed monthly or yearly price.`, "not-measured", SRC.finance));
  metrics.push(lovable);
  const soon = office
    .map((s) => ({ s, days: s.nextRenewal?.date ? Math.ceil((Date.parse(s.nextRenewal.date) - raw.now.getTime()) / DAY) : null }))
    .filter((x): x is { s: SubscriptionRecord; days: number } => x.days !== null && Number.isFinite(x.days) && x.days >= 0 && x.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  const items: ListItem[] = soon.slice(0, 6).map(({ s, days }) => ({
    label: `${str(s.name, 60)} renews ${s.nextRenewal!.date}${s.nextRenewal!.basis === "estimated" ? " (estimated date)" : ""}`,
    detail: `${days === 0 ? "today" : `in ${plural(days, "day")}`} · ${s.knownCost ? `${money(s.knownCost.amount, s.knownCost.currency)} confirmed` : "price not confirmed"}`,
    tone: days <= 7 ? "warn" : "neutral",
  }));
  // Six months of CAD receipt totals (real filed receipts only).
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(zonedMonth(new Date(Date.UTC(raw.now.getUTCFullYear(), raw.now.getUTCMonth() - i, 15))));
  const cadSeries: Series = {
    label: "CAD receipts by month", unit: "C$", accent: "orange", state: "live", source: SRC.finance, updatedAt: at,
    points: months.map((m) => ({ label: m.slice(5) + "/" + m.slice(2, 4), value: Math.round(kept.filter((r) => r.date.slice(0, 7) === m && r.currency === "CAD" && r.total !== null).reduce((sum, r) => sum + (r.total ?? 0), 0) * 100) / 100 })),
  };
  const attention = [
    ...(metrics.some((m) => m.tone === "alert") ? ["Filed receipts are already above the C$500 monthly ceiling."] : []),
    ...soon.filter((x) => x.days <= 7).map((x) => `${str(x.s.name, 60)} renews in ${plural(x.days, "day")}.`),
    ...(office.length > priced.length ? [`${office.length - priced.length} saved services have no confirmed price yet.`] : []),
  ];
  return {
    id: "money", title: "Money and Budgets", subtitle: "Expenses, subscriptions, budgets", accent: "orange", headline, metrics,
    series: kept.some((r) => r.currency === "CAD") ? [cadSeries] : [], items, attention,
    recommendation: soon.some((x) => x.days <= 7)
      ? "Decide on the renewals due this week before they charge."
      : office.length > priced.length ? "Confirm the prices of saved services in Subscriptions so the monthly total becomes complete." : "Keep filing receipts as they arrive so this month's total stays complete.",
  };
}

function apiCard(raw: AnalyticsRaw): AnalyticsCard {
  const notConnected = unmeasured("Provider credit remaining (OpenAI, Anthropic)", "Provider billing accounts are not connected to the Office, so remaining credit is unknown.", "not-connected", "Provider billing (not connected)");
  const claudeCap = policy("Claude builder cap per build", money(CLAUDE_BUILD_CAP_USD, "USD"), "The most one Claude build may spend. It is a cap, not what builds actually cost.");
  const metrics: Metric[] = [];
  let headline: Metric;
  const attention: string[] = [];
  if (readOk(raw.budget)) {
    const b = raw.budget.data;
    const pct = b.ceilingCents > 0 ? Math.round((b.usedCents / b.ceilingCents) * 100) : null;
    const tone: Tone = b.paused ? "alert" : b.warning ? "warn" : "good";
    headline = live("Office AI meter this month", `${b.usedCents.toLocaleString("en-CA")} of ${b.ceilingCents.toLocaleString("en-CA")} estimated cents${pct !== null ? ` (${pct}%)` : ""}`,
      SRC.budget, raw.budget.at, tone, `Warning at ${b.warnCents.toLocaleString("en-CA")} cents; calls pause at the ceiling. The meter records estimates made before each call, not provider invoices.`, "estimate");
    metrics.push(headline);
    if (b.paused) attention.push("The Office AI meter has reached its monthly ceiling, so Elsie's paid AI calls are paused.");
    else if (b.warning) attention.push(`The Office AI meter is past its warning line (${pct ?? "?"}% used).`);
  } else {
    headline = missing("Office AI meter this month", raw.budget, SRC.budget);
    metrics.push(headline);
  }
  const series: Series[] = [];
  if (readOk(raw.usage)) {
    const start = utcMonthStart(raw.now);
    const month = raw.usage.data.filter((u) => Date.parse(u.at) >= start.getTime());
    const days = raw.now.getUTCDate();
    const perDay = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), value: 0 }));
    for (const u of month) { const d = new Date(u.at).getUTCDate(); const p = perDay[d - 1]; if (p) p.value += u.cents; }
    const ok = month.filter((u) => u.outcome === "ok");
    const heaviest = perDay.reduce((best, p) => (p.value > best.value ? p : best), { label: "", value: 0 });
    metrics.push(live("Office AI calls this month", `${month.length}`, SRC.usage, raw.usage.at, "neutral", `${ok.length} completed, ${month.filter((u) => u.outcome === "failed").length} failed, ${month.filter((u) => u.outcome !== "ok" && u.outcome !== "failed").length} still open.`));
    metrics.push(month.length
      ? live("Average estimate per call", `${(month.reduce((s, u) => s + u.cents, 0) / month.length).toFixed(1)} cents`, SRC.usage, raw.usage.at, "neutral", undefined, "estimate")
      : unmeasured("Average estimate per call", "No Office AI calls recorded this month yet.", "not-measured", SRC.usage));
    if (heaviest.value > 0) metrics.push(live("Heaviest day", `Day ${heaviest.label}: ${heaviest.value} cents`, SRC.usage, raw.usage.at, "neutral", undefined, "estimate"));
    series.push({ label: "Estimated AI cents per day (this month, UTC)", unit: "cents", accent: "lime", state: "estimate", source: SRC.usage, updatedAt: raw.usage.at, points: perDay });
  } else metrics.push(missing("Office AI calls this month", raw.usage, SRC.usage, "The call log could not be read with your sign-in; the meter total above (when shown) still comes from the database."));
  metrics.push(notConnected, claudeCap, unmeasured("Codex build cost", "OpenAI does not report per-build cost to the Office.", "not-measured", "OpenAI billing (not connected)"));
  return {
    id: "api", title: "API Usage and Credits", subtitle: "Consumption, limits, warnings", accent: "lime", headline, metrics, series, items: [], attention,
    recommendation: attention.length ? "Look at the heaviest days first and ask Elsie what caused them before raising any limit." : "Usage is under the warning line. Connecting provider billing later would show real remaining credit.",
  };
}

interface BuilderStats { name: string; runs: BuildRun[]; done: BuildRun[]; ok: BuildRun[]; bad: BuildRun[]; minutes: number[]; at: string }
function builderStats(name: string, r: Read<BuildRun[]>): BuilderStats | null {
  if (!readOk(r)) return null;
  const runs = r.data;
  const done = runs.filter((x) => ["success", "failure", "cancelled", "timed_out", "skipped"].includes(x.state));
  const ok = runs.filter((x) => x.state === "success");
  const bad = runs.filter((x) => x.state === "failure" || x.state === "timed_out");
  const minutes = done.map((x) => minutesBetween(x.startedAt ?? x.createdAt, x.updatedAt)).filter((m): m is number => m !== null);
  return { name, runs, done, ok, bad, minutes, at: r.at };
}

function buildersCard(raw: AnalyticsRaw): AnalyticsCard {
  const c = builderStats("Claude", raw.builds.claude), x = builderStats("ChatGPT / Codex", raw.builds.codex);
  const metrics: Metric[] = [];
  const add = (s: BuilderStats | null, read: Read<BuildRun[]>, label: string, source: string) => {
    if (!s) { metrics.push(missing(`${label} builds`, read, source)); return; }
    const rate = s.ok.length + s.bad.length ? Math.round((s.ok.length / (s.ok.length + s.bad.length)) * 100) : null;
    metrics.push(live(`${label} builds`, `${s.runs.length} runs · ${s.ok.length} passed · ${s.bad.length} failed`, source, s.at, s.bad.length > s.ok.length ? "warn" : "neutral",
      rate !== null ? `${rate}% of finished runs passed their checks. A passing build is a draft, not a release.` : "No finished runs yet."));
    const med = median(s.minutes);
    metrics.push(med !== null ? live(`${label} typical run time`, `${med.toFixed(1)} min (median)`, source, s.at) : unmeasured(`${label} typical run time`, "No finished runs with timestamps.", "not-measured", source));
    const last = s.runs[0];
    if (last) metrics.push(live(`${label} latest run`, `${last.title || `run ${last.id}`}: ${last.state}`, source, s.at, last.state === "failure" ? "warn" : "neutral", `Started ${last.createdAt}`));
  };
  add(c, raw.builds.claude, "Claude", SRC.claude);
  add(x, raw.builds.codex, "ChatGPT / Codex", SRC.codex);
  metrics.push(unmeasured("Cost per successful build", `Neither builder reports its actual cost to the Office. Claude builds are capped at ${money(CLAUDE_BUILD_CAP_USD, "USD")} each by policy.`));
  const headline: Metric = c && x
    ? live("Office builder runs", `Claude ${c.ok.length}/${c.done.length} passed · Codex ${x.ok.length}/${x.done.length} passed`, `${SRC.claude}; ${SRC.codex}`, c.at, "neutral", "Passed / finished runs, all Office builder runs on record (up to 100 per builder).")
    : c ? metrics[0]! : x ? metrics.find((m) => m.label.startsWith("ChatGPT"))! : missing("Office builder runs", raw.builds.claude, SRC.claude);
  const series: Series[] = [];
  if (c || x) {
    const at = (c ?? x)!.at;
    series.push({ label: "Passed runs", unit: "runs", accent: "lime", state: "live", source: `${SRC.claude}; ${SRC.codex}`, updatedAt: at, points: [{ label: "Claude", value: c?.ok.length ?? 0 }, { label: "Codex", value: x?.ok.length ?? 0 }] });
    series.push({ label: "Failed runs", unit: "runs", accent: "orange", state: "live", source: `${SRC.claude}; ${SRC.codex}`, updatedAt: at, points: [{ label: "Claude", value: c?.bad.length ?? 0 }, { label: "Codex", value: x?.bad.length ?? 0 }] });
  }
  const attention = [
    ...(c && c.bad.length > c.ok.length ? ["Claude builds failed more often than they passed."] : []),
    ...(x && x.bad.length > x.ok.length ? ["Codex builds failed more often than they passed."] : []),
    ...[c, x].flatMap((s) => (s?.runs[0]?.state === "failure" ? [`The latest ${s.name} build failed.`] : [])),
  ];
  return {
    id: "builders", title: "Builder Performance", subtitle: "Claude vs ChatGPT / Codex", accent: "blue", headline, metrics, series, items: [], attention,
    recommendation: attention.length ? "Read the failed run's checks before sending new work; most recent failures came from tests that needed updating with the screen change." : "Both builders are passing. Keep sending one clear change per build.",
  };
}

function sourcesCard(raw: AnalyticsRaw): AnalyticsCard {
  const tasks = readOk(raw.tasks) ? raw.tasks.data.map(taskView) : null;
  const runs = [...(readOk(raw.builds.claude) ? raw.builds.claude.data : []), ...(readOk(raw.builds.codex) ? raw.builds.codex.data : [])];
  const runsKnown = readOk(raw.builds.claude) || readOk(raw.builds.codex);
  const notRecorded = unmeasured("Started by John personally", "The Office does not record who pressed a direct build (John's Build & Testing panel, Elsie's direct build tool, or an assistant connector all look the same on GitHub).");
  if (!tasks) {
    const m = missing("Builds handed off through Elsie's Work Board", raw.tasks, SRC.tasks);
    return { id: "sources", title: "Assignment Sources", subtitle: "John vs Elsie handoffs", accent: "blue", headline: m, metrics: [m, notRecorded], series: [], items: [], attention: [], recommendation: "Refresh once the Work Board can be read." };
  }
  const links = tasks.map(taskBuildLink).filter((l): l is TaskBuildLink => l !== null);
  const linkedRunIds = new Set(links.map((l) => l.runId).filter((n): n is number => n !== null));
  const elsieQueued = links.filter((l) => l.queuedByElsie).length;
  const at = raw.tasks.status === "read" ? raw.tasks.at : raw.now.toISOString();
  const handoffs = live("Builds handed off through Elsie's Work Board", `${links.length}`, SRC.tasks, at, "neutral",
    `${elsieQueued} of them went through Elsie's builder queue; ${links.filter((l) => l.runId === null).length} have no GitHub run recorded.`);
  const metrics: Metric[] = [handoffs];
  const direct = runsKnown ? runs.filter((r) => !linkedRunIds.has(r.id)).length : null;
  if (direct !== null) {
    metrics.push(live("Builds started directly (not from a Work Board task)", `${direct}`, `${SRC.claude}; ${SRC.codex}; ${SRC.tasks}`, at, "neutral", "Office builder runs whose run number is not on any Work Board task."));
  } else metrics.push(missing("Builds started directly", raw.builds.codex, SRC.codex));
  metrics.push(notRecorded);
  const series: Series[] = runsKnown ? [{
    label: "Where builds came from", unit: "builds", accent: "blue", state: "live", source: `${SRC.tasks}; GitHub builder runs`, updatedAt: at,
    points: [{ label: "Elsie handoff", value: links.length }, { label: "Direct start", value: direct ?? 0 }],
  }] : [];
  return {
    id: "sources", title: "Assignment Sources", subtitle: "John vs Elsie handoffs", accent: "blue",
    headline: direct !== null ? { ...handoffs, label: "Where builds came from", value: `${links.length} via Elsie · ${direct} direct` } : handoffs, metrics, series, items: [], attention: [],
    recommendation: "To tell John's own requests apart from Elsie's in future, builds would need to record who asked. That is a small logging change John can approve later.",
  };
}

const NAMED_PROJECTS = ["Safe Highways", "Trails & Tales", "Idea Garage", "Best Sandwich Ever", "The Disposable Race"];

function projectsCard(raw: AnalyticsRaw): AnalyticsCard {
  const tasks = readOk(raw.tasks) ? raw.tasks.data.map(taskView) : [];
  const byProject = new Map<string, { active: number; waiting: number; done: number; reasons: string[] }>();
  for (const t of tasks) {
    const key = t.project && t.project !== "no project" ? t.project : "";
    if (!key) continue;
    const p = byProject.get(key) ?? { active: 0, waiting: 0, done: 0, reasons: [] };
    if (t.status === "done") p.done++;
    else if (t.status === "waiting") { p.waiting++; if (t.waitingReason) p.reasons.push(t.waitingReason); }
    else if (ACTIVE.has(t.status)) p.active++;
    byProject.set(key, p);
  }
  const items: ListItem[] = [];
  let headline: Metric;
  const metrics: Metric[] = [];
  if (readOk(raw.projects)) {
    const reg = raw.projects.data;
    headline = live("Registered projects", `${reg.length} registered`, SRC.projects, raw.projects.at, "neutral", "Stage and next move come only from John's saved plans; 'unknown' means not verified.");
    metrics.push(headline);
    for (const name of NAMED_PROJECTS) {
      const hit = reg.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
      items.push(hit
        ? { label: `${hit.name} · stage ${hit.stage || "unknown"}`, detail: hit.nextMove ? `Next: ${hit.nextMove}` : "No next move saved", tone: hit.stage === "unknown" || !hit.stage ? "neutral" : "good" }
        : { label: `${name}`, detail: "Not in the project register", tone: "neutral" });
    }
    for (const p of reg.filter((p) => !NAMED_PROJECTS.some((n) => p.name.toLowerCase().includes(n.toLowerCase()))).slice(0, 6)) {
      items.push({ label: `${p.name} · stage ${p.stage || "unknown"}`, detail: p.nextMove ? `Next: ${p.nextMove}` : "No next move saved", tone: "neutral" });
    }
  } else {
    headline = missing("Registered projects", raw.projects, SRC.projects);
    metrics.push(headline);
  }
  if (readOk(raw.tasks)) {
    const blocked = [...byProject.entries()].filter(([, v]) => v.waiting > 0);
    metrics.push(live("Projects with waiting tasks", `${blocked.length}`, SRC.tasks, raw.tasks.at, blocked.length ? "warn" : "good"));
    for (const [name, v] of [...byProject.entries()].sort((a, b) => b[1].active + b[1].waiting - (a[1].active + a[1].waiting)).slice(0, 6)) {
      items.push({ label: `Work Board: ${name}`, detail: `${v.active} active · ${v.waiting} waiting · ${v.done} done${v.reasons[0] ? ` · waiting on: ${v.reasons[0]}` : ""}`, tone: v.waiting ? "warn" : "neutral" });
    }
  } else metrics.push(missing("Projects with waiting tasks", raw.tasks, SRC.tasks));
  metrics.push(unmeasured("Percent complete", "Not shown on purpose: no project records a verified percentage, and guessing from task titles would be invented."));
  return {
    id: "projects", title: "Projects and Readiness", subtitle: "Milestones and blockers", accent: "lime", headline, metrics, series: [], items,
    attention: [...byProject.entries()].filter(([, v]) => v.waiting > 0).map(([n, v]) => `${n}: ${plural(v.waiting, "task")} waiting${v.reasons[0] ? ` on ${v.reasons[0]}` : ""}.`).slice(0, 4),
    recommendation: "Give each active project a saved stage and next move in Projects so readiness can be shown instead of 'unknown'.",
  };
}

function timeCard(raw: AnalyticsRaw): AnalyticsCard {
  const metrics: Metric[] = [];
  const series: Series[] = [];
  const c = builderStats("Claude", raw.builds.claude), x = builderStats("Codex", raw.builds.codex);
  const allMinutes = [...(c?.minutes ?? []), ...(x?.minutes ?? [])];
  const med = median(allMinutes);
  const headline = med !== null && (c || x)
    ? live("Typical active build time", `${med.toFixed(1)} min (median of ${allMinutes.length} runs)`, `${SRC.claude}; ${SRC.codex}`, (c ?? x)!.at)
    : (c || x) ? unmeasured("Typical active build time", "No finished runs with timestamps.", "not-measured", SRC.codex) : missing("Typical active build time", raw.builds.codex, SRC.codex);
  metrics.push(headline);
  const failedRuns = (c?.bad.length ?? 0) + (x?.bad.length ?? 0);
  if (c || x) metrics.push(live("Failed build attempts (errors and retries)", `${failedRuns}`, `${SRC.claude}; ${SRC.codex}`, (c ?? x)!.at, failedRuns ? "warn" : "good", "Each failed run cost a full build's time before a retry."));
  if (readOk(raw.tasks)) {
    const tasks = raw.tasks.data.map(taskView);
    const active = tasks.filter((t) => ACTIVE.has(t.status));
    const ages = active.map((t) => daysBetween(t.createdAt, raw.now)).filter((d): d is number => d !== null);
    const waiting = tasks.filter((t) => t.status === "waiting");
    const oldestWait = Math.max(-1, ...waiting.map((t) => daysBetween(t.updatedAt || t.createdAt, raw.now) ?? -1));
    metrics.push(ages.length ? live("Typical age of unfinished tasks", `${median(ages)!.toFixed(0)} days (median of ${ages.length})`, SRC.tasks, raw.tasks.at, (median(ages) ?? 0) > STALE_TASK_DAYS ? "warn" : "neutral", "Elapsed calendar time since each task was created.") : live("Typical age of unfinished tasks", "No unfinished tasks", SRC.tasks, raw.tasks.at, "good"));
    metrics.push(live("Tasks waiting", waiting.length ? `${waiting.length} (oldest ${oldestWait} days)` : "0", SRC.tasks, raw.tasks.at, waiting.length ? "warn" : "good"));
  } else metrics.push(missing("Typical age of unfinished tasks", raw.tasks, SRC.tasks));
  metrics.push(unmeasured("Review time (build finished to merge)", "Merges are not linked back to Office tasks yet."));
  metrics.push(unmeasured("Time saved by improvements", "No before/after baseline has been recorded yet."));
  const recent = [...(c?.done ?? []).map((r) => ({ r, who: "Claude" })), ...(x?.done ?? []).map((r) => ({ r, who: "Codex" }))]
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt)).slice(0, 10).reverse();
  if (recent.length) series.push({
    label: "Minutes per build (latest 10)", unit: "min", accent: "blue", state: "live", source: `${SRC.claude}; ${SRC.codex}`, updatedAt: (c ?? x)!.at,
    points: recent.map(({ r, who }) => ({ label: `${who[0]}${r.title.match(/(\d+)\s*$/)?.[1] ?? ""}`, value: Math.round((minutesBetween(r.startedAt ?? r.createdAt, r.updatedAt) ?? 0) * 10) / 10 })),
  });
  return {
    id: "time", title: "Time Management", subtitle: "Build, waiting, errors, retries", accent: "blue", headline, metrics, series, items: [],
    attention: failedRuns ? [`${plural(failedRuns, "failed build")} each used a full build's time.`] : [],
    recommendation: "The biggest time cost is waiting tasks and failed builds, not build speed. Clear or close old waiting tasks first.",
  };
}

function bottlenecksCard(raw: AnalyticsRaw): AnalyticsCard {
  const items: ListItem[] = [];
  const metrics: Metric[] = [];
  let headline: Metric;
  const attention: string[] = [];
  if (readOk(raw.tasks)) {
    const tasks = raw.tasks.data.map(taskView);
    const stale = tasks.filter((t) => (t.status === "in_progress" || t.status === "open") && (daysBetween(t.updatedAt || t.createdAt, raw.now) ?? 0) > STALE_TASK_DAYS);
    const waiting = tasks.filter((t) => t.status === "waiting");
    const links = tasks.map((t) => ({ t, l: taskBuildLink(t) })).filter((x): x is { t: TaskView; l: TaskBuildLink } => x.l !== null);
    const failedOpen = links.filter(({ t, l }) => ACTIVE.has(t.status) && (l.state === "failure" || l.state === "submission_unconfirmed"));
    headline = live("Stalled or blocked work", `${stale.length + waiting.length + failedOpen.length} items`, SRC.tasks, raw.tasks.at, stale.length + waiting.length + failedOpen.length ? "warn" : "good",
      `Stalled = open or in progress with no update for more than ${STALE_TASK_DAYS} days.`);
    metrics.push(headline,
      live(`Untouched for ${STALE_TASK_DAYS}+ days`, `${stale.length}`, SRC.tasks, raw.tasks.at, stale.length ? "warn" : "good"),
      live("Waiting on something", `${waiting.length}`, SRC.tasks, raw.tasks.at, waiting.length ? "warn" : "good"),
      live("Open tasks whose build failed or was unconfirmed", `${failedOpen.length}`, SRC.tasks, raw.tasks.at, failedOpen.length ? "warn" : "good"));
    for (const { t, l } of failedOpen.slice(0, 3)) items.push({ label: t.title || "Untitled task", detail: `${l.builder === "claude" ? "Claude" : "Codex"} build ${l.state === "failure" ? "failed" : "submission was not confirmed"}; task still ${t.status}`, tone: "alert" });
    for (const t of waiting.slice(0, 3)) items.push({ label: t.title || "Untitled task", detail: `Waiting on: ${t.waitingReason || "reason not recorded"}`, tone: "warn" });
    for (const t of stale.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 4)) items.push({ label: t.title || "Untitled task", detail: `${t.status.replace("_", " ")} · no update for ${daysBetween(t.updatedAt || t.createdAt, raw.now)} days`, tone: "warn" });
    if (stale.length) attention.push(`${plural(stale.length, "task")} ${stale.length === 1 ? "has" : "have"} not moved for more than ${STALE_TASK_DAYS} days.`);
    if (failedOpen.length) attention.push(`${plural(failedOpen.length, "task")} still open after a failed or unconfirmed build.`);
  } else {
    headline = missing("Stalled or blocked work", raw.tasks, SRC.tasks);
    metrics.push(headline);
  }
  if (readOk(raw.usage)) {
    const start = utcMonthStart(raw.now).getTime();
    const bad = raw.usage.data.filter((u) => Date.parse(u.at) >= start && u.outcome === "failed").length;
    metrics.push(live("Connection failures (Office AI calls this month)", `${bad}`, SRC.usage, raw.usage.at, bad ? "warn" : "good"));
  }
  metrics.push(unmeasured("Before/after results of fixes", "No improvement has a recorded baseline yet; results will show once one is saved."));
  return {
    id: "bottlenecks", title: "Bottlenecks and Improvements", subtitle: "Stalled work and fixes", accent: "orange", headline, metrics, series: [], items, attention,
    recommendation: items.length
      ? "Start with the oldest stalled tasks: close the ones that are no longer wanted and re-scope the rest into one clear next step. Ask Elsie for a second opinion from Claude or ChatGPT before sending any failed build again."
      : "Nothing is stalled in this read.",
  };
}

interface ActionCandidate { priority: number; title: string; detail: string; source: string; at: string }

function actionsCard(raw: AnalyticsRaw, cards: AnalyticsCard[]): AnalyticsCard {
  const c: ActionCandidate[] = [];
  if (raw.aal !== "aal2" && raw.aal !== "viewer") c.push({ priority: 1, title: "Enter your authenticator code", detail: "Money, project and Finance numbers stay hidden without two-step sign-in.", source: "This session's sign-in level", at: raw.now.toISOString() });
  if (readOk(raw.approvals)) {
    const pending = raw.approvals.data.filter((a) => str(a["status"], 20) === "pending");
    if (pending.length) c.push({ priority: 2, title: `Decide ${plural(pending.length, "approval")} waiting for you`, detail: pending.slice(0, 2).map((a) => str(a["title"], 80)).filter(Boolean).join("; "), source: SRC.approvals, at: raw.approvals.at });
  }
  if (readOk(raw.budget) && (raw.budget.data.paused || raw.budget.data.warning)) c.push({ priority: raw.budget.data.paused ? 1 : 3, title: raw.budget.data.paused ? "Office AI meter is at its ceiling" : "Office AI meter passed its warning line", detail: `${raw.budget.data.usedCents} of ${raw.budget.data.ceilingCents} estimated cents used this month.`, source: SRC.budget, at: raw.budget.at });
  const money = cards.find((x) => x.id === "money");
  for (const it of money?.items.filter((i) => i.tone === "warn") ?? []) c.push({ priority: 3, title: it.label, detail: it.detail, source: SRC.finance, at: readOk(raw.finance) ? raw.finance.at : raw.now.toISOString() });
  const bn = cards.find((x) => x.id === "bottlenecks");
  for (const it of bn?.items.filter((i) => i.tone === "alert") ?? []) c.push({ priority: 4, title: `Failed build: ${it.label}`, detail: it.detail, source: SRC.tasks, at: readOk(raw.tasks) ? raw.tasks.at : raw.now.toISOString() });
  if (readOk(raw.tasks)) {
    const waiting = raw.tasks.data.map(taskView).filter((t) => t.status === "waiting").sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    if (waiting[0]) c.push({ priority: 5, title: `Unblock: ${waiting[0].title}`, detail: `Waiting on: ${waiting[0].waitingReason || "reason not recorded"}`, source: SRC.tasks, at: raw.tasks.at });
  }
  const top = c.sort((a, b) => a.priority - b.priority).slice(0, 3);
  const at = raw.now.toISOString();
  const headline: Metric = top.length
    ? live("Most important right now", top[0]!.title, top[0]!.source, top[0]!.at, "warn")
    : live("Most important right now", "Nothing urgent in the sources read", "Every source read for this room", at, "good");
  const unread = [raw.approvals.status, raw.tasks.status, raw.budget.status].filter((s) => s !== "read").length;
  return {
    id: "actions", title: "Top Three Actions", subtitle: "What needs John's attention", accent: "orange", headline,
    metrics: [headline, ...(unread ? [unmeasured("Sources not read for this list", `${unread} of the sources this list depends on could not be read, so something important may be missing.`, "failed", "This Analytics read")] : [])],
    series: [], items: top.map((t, i) => ({ label: `${i + 1}. ${t.title}`, detail: `${t.detail}${t.detail ? " · " : ""}source: ${t.source}`, tone: t.priority <= 2 ? "alert" : "warn" })),
    attention: top.map((t) => t.title),
    recommendation: top.length ? `Start with: ${top[0]!.title}.` : "Nothing urgent. Showing an alert here never creates an approval, payment or build.",
  };
}

function securityCard(raw: AnalyticsRaw): AnalyticsCard {
  const at = raw.now.toISOString();
  const signIn = raw.aal === "aal2" ? live("Two-step sign-in for this session", "On", "This session's sign-in level", at, "good")
    : raw.aal === "viewer" ? live("Two-step sign-in for this session", "Read-only viewer", "This session's sign-in level", at, "neutral")
    : live("Two-step sign-in for this session", "Off (password only)", "This session's sign-in level", at, "warn", "Protected rooms and Finance stay locked until the authenticator code is entered.");
  const backup = unmeasured("Database backup and restore", "The CanX-owned database exists, but a backup restore has not been tested yet.", "awaiting-verification", "Systems room backup status");
  const rollback: Metric = { label: "Rollback path", value: null, state: "awaiting-verification", source: "Release procedure (docs/analytics-room-release.md)", updatedAt: null, tone: "neutral", note: "Every Office release is a GitHub commit: revert it on main and republish to restore the previous version. No rollback drill has been recorded from the Office yet." };
  const changes = readOk(raw.changes)
    ? live("Latest recorded Office change", raw.changes.data[0] ? `${str(raw.changes.data[0]["action"], 60)} (${str(raw.changes.data[0]["at"], 16).replace("T", " ")} UTC)` : "No changes recorded", SRC.changes, raw.changes.at)
    : missing("Latest recorded Office change", raw.changes, SRC.changes);
  const attention = [...(raw.aal !== "aal2" && raw.aal !== "viewer" ? ["Two-step sign-in is off for this session."] : []), "Backup restore has never been tested."];
  return {
    id: "security", title: "Security and Recovery", subtitle: "Backups, rollback, warnings", accent: "lime", headline: signIn, metrics: [signIn, backup, rollback, changes], series: [], items: [], attention,
    recommendation: "Schedule one supervised backup-restore test so recovery is proven, not assumed. It needs your approval because it touches the database.",
  };
}

/* ------------------------------- assemble ------------------------------- */

function check(key: string, label: string, r: Read<unknown>): SourceCheck {
  return r.status === "read" ? { key, label, status: "read", detail: "" } : { key, label, status: r.status, detail: r.detail };
}

export function buildAnalyticsOverview(raw: AnalyticsRaw): AnalyticsOverview {
  const sources: SourceCheck[] = [
    check("tasks", "Work Board", raw.tasks),
    check("approvals", "Approval box", raw.approvals),
    check("budget", "AI budget meter", raw.budget),
    check("usage", "AI call log", raw.usage),
    check("finance", "Finance", raw.finance),
    check("projects", "Project register", raw.projects),
    check("claude", "Claude builder (GitHub)", raw.builds.claude),
    check("codex", "Codex builder (GitHub)", raw.builds.codex),
    check("changes", "Change log", raw.changes),
  ];
  const partial = [healthCard(raw, sources), moneyCard(raw), apiCard(raw), buildersCard(raw), sourcesCard(raw), projectsCard(raw), timeCard(raw), bottlenecksCard(raw)];
  const cards = [...partial, actionsCard(raw, partial), securityCard(raw)];
  return {
    contract: ANALYTICS_CONTRACT,
    checkedAt: raw.now.toISOString(),
    signIn: raw.aal === "aal2" ? "two-step" : raw.aal === "aal1" ? "one-step" : raw.aal === "viewer" ? "viewer" : "unknown",
    sources,
    cards: CARD_ORDER.map((id) => cards.find((c) => c.id === id)!),
  };
}

/* ------------------------------- Elsie ------------------------------- */

/** What each card is for, in plain words. Static app text, used by the room and by Elsie. */
export const CARD_GUIDE: Record<CardId, { measures: string; why: string; normal: string; warning: string; analogy: string }> = {
  health: { measures: "whether the Office could reach each of its record stores just now, and how many of Elsie's AI calls failed this month", why: "if a source can't be read, every number that depends on it is unknown", normal: "every source read OK and few or no failed calls", warning: "a source failed, is locked behind two-step sign-in, or is not connected", analogy: "like checking every light on a car dashboard turns on before you drive" },
  money: { measures: "receipts filed this month, confirmed subscription prices, upcoming renewals, and John's budget limits", why: "it shows whether the Office is staying under the C$500 monthly ceiling", normal: "receipts well under C$500 and no surprise renewals", warning: "a renewal within 7 days, services without a confirmed price, or receipts over the ceiling", analogy: "like a piggy bank with a line drawn on it: the line is the limit, the coins are what was really spent" },
  api: { measures: "how much of the Office AI meter has been used this month, calls per day, and the Claude build cap", why: "Elsie's paid AI calls stop when the meter reaches its ceiling", normal: "under the warning line (75% of the ceiling)", warning: "past the warning line, or paused at the ceiling", analogy: "like a phone data plan: the meter shows how much of this month's allowance is used" },
  builders: { measures: "how many Office builds Claude and ChatGPT/Codex ran, how many passed or failed, and how long they took", why: "failed builds waste time and money and need fixing before more work is sent", normal: "most finished builds pass", warning: "more failures than passes, or the latest build failed", analogy: "like two bakers: how many cakes each baked, how many came out right, and how long each took" },
  sources: { measures: "how many builds went through Elsie's Work Board handoff versus started directly", why: "it shows how much work Elsie is coordinating for John", normal: "work that needs tracking goes through the Work Board", warning: "who pressed a direct build is not recorded, so John vs others can't be split yet", analogy: "like counting which orders came through the front counter and which came by phone" },
  projects: { measures: "registered projects, their saved stage and next move, and Work Board tasks per project", why: "it shows what is moving and what is stuck", normal: "each project has a saved stage and next move", warning: "waiting tasks, or 'unknown' stages", analogy: "like a map with a pin for each project and a flag where it's stuck" },
  time: { measures: "typical build time, failed attempts, how old unfinished tasks are, and how many are waiting", why: "waiting and retries usually cost more time than the builds themselves", normal: "few waiting tasks and few failed builds", warning: "tasks older than two weeks or several failed builds", analogy: "like timing a school day: class time, waiting in line, and do-overs" },
  bottlenecks: { measures: "tasks with no update for two weeks, waiting tasks, and tasks still open after a failed build", why: "these are the jams that slow everything else down", normal: "nothing stalled", warning: "any stalled, waiting or failed-build task", analogy: "like finding the one slow car that is holding up the whole highway lane" },
  actions: { measures: "the three most important verified things for John, picked from approvals, sign-in, AI meter, renewals, failed builds and waiting tasks", why: "it saves John from reading every card", normal: "nothing urgent", warning: "any item listed", analogy: "like a sticky note on the fridge with the top three chores" },
  security: { measures: "two-step sign-in, backup testing, the rollback path and the latest recorded change", why: "it shows whether the Office could recover if something broke", normal: "two-step on, backup restore tested, rollback ready", warning: "two-step off or recovery never tested", analogy: "like knowing where the spare key and the fire exit are before you need them" },
};

// Read times are left out on purpose: every reading in one Analytics read is taken at the snapshot's checked time,
// and leaving them out keeps the snapshot fingerprint stable while the data itself is unchanged.
const fmtMetric = (m: Metric) => `${m.label}: ${m.value ?? STATE_LABEL[m.state]} [${STATE_LABEL[m.state]}; source ${m.source}]${m.note ? ` (${m.note})` : ""}`;

/** Bounded lines for Elsie's room snapshot: every card, its readings, source and state. */
export function analyticsForModel(o: AnalyticsOverview): string[] {
  return o.cards.map((c) => {
    const parts = [
      `CARD ${c.title}`,
      ...c.metrics.slice(0, 8).map(fmtMetric),
      ...c.items.slice(0, 6).map((i) => `• ${i.label} — ${i.detail}`),
      ...(c.attention.length ? [`Needs attention: ${c.attention.slice(0, 4).join(" ")}`] : ["Needs attention: nothing in this read."]),
      `Room's recommendation: ${c.recommendation}`,
    ];
    return parts.join(" | ").slice(0, 1600);
  });
}

/** Built-in explanation procedure for the Analytics room (not a registry skill; grants no tools). */
export const ANALYTICS_ELSIE_PROCEDURE = [
  "Analytics room explainer (built in): when John asks about this room or any card, answer ONLY from the CARD lines in this snapshot.",
  "For each card you explain, say: what it measures; what the numbers mean; whether each number is Live, an Estimate, a Policy limit, Not connected, Not measured, Needs two-step sign-in or Could not be read (never call a policy limit spending, never turn a missing number into zero); why it matters; what needs attention; and the room's recommendation.",
  "When John asks you to explain like he is 10, use short sentences, one everyday comparison per card, and no jargon. For the whole room, go card by card in order and pause after every two or three cards so he can ask questions or interrupt; offer the deeper technical version only if he asks.",
  `Plain-language card guide: ${CARD_ORDER.map((id) => `${id}: measures ${CARD_GUIDE[id].measures}; normal is ${CARD_GUIDE[id].normal}; warning is ${CARD_GUIDE[id].warning}; comparison: ${CARD_GUIDE[id].analogy}`).join(". ")}.`,
  "Second opinions: if John asks for Claude's or ChatGPT's view, use only the existing second_eyes_review or handoff_to_chatgpt_text tools on a saved task; report their actual saved reply or that it could not be delivered. Never invent a colleague's answer. A recommendation is never approval to spend, change budgets or deploy.",
].join(" ");
