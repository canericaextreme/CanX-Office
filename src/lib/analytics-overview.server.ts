/**
 * Analytics Control Room reader — SERVER ONLY.
 *
 * Collects the raw readings for analytics-overview.ts through the owner's own
 * token (RLS applies) and, for builder runs, the Office server's existing
 * read-only GitHub connection. Every source reports its own status; a failed
 * read stays "failed", never empty. Nothing is written, no AI is called and no
 * build is started. Finance and the project register need two-step (AAL2).
 * A read-only viewer only gets sources whose room John shared with it: viewer row
 * security hides rows instead of refusing, so an unshared table would look empty,
 * and empty must never be shown as a measured zero.
 */
import type { BackendConfig } from "./canx-backend.server";
import type { AnalyticsRaw, BudgetStatus, BuildRun, FinanceData, ProjectRow, Read, Row, UsageRow } from "./analytics-overview";

export type AnalyticsRest = (config: BackendConfig, token: string, path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;
export type GitHubRead = (path: string) => Promise<{ ok: boolean; status: number; body: unknown }>;

export interface AnalyticsRequest {
  config: BackendConfig;
  token: string;
  aal: string;
  rest: AnalyticsRest;
  /** Read-only GitHub reader for the Office repository, or null when no server credential is configured. */
  github: GitHubRead | null;
  /** For a read-only viewer: the rooms John shared with it (from the verified grant). Ignored for the owner. */
  viewerRooms?: readonly string[];
  now?: () => Date;
}

const OFFICE_REPO = "canericaextreme/CanX-Office";
const at = () => new Date().toISOString();
const failed = (detail = "could not be read just now"): Read<never> => ({ status: "failed", detail });
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

async function rows(req: AnalyticsRequest, path: string): Promise<Read<Row[]>> {
  const res = await req.rest(req.config, req.token, path).catch(() => null);
  if (!res) return failed();
  if (res.ok && Array.isArray(res.body)) return { status: "read", at: at(), data: res.body as Row[] };
  return failed(res.status === 401 || res.status === 403 ? "your sign-in was refused for this record" : `database replied ${res.status}`);
}

const twoStep = (aal: string) => aal === "aal2" || aal === "viewer";

/** Viewer only: a "not-shared" result when any room this source depends on was not shared with the viewer. */
function notSharedFor(req: AnalyticsRequest, rooms: string[]): Read<never> | null {
  if (req.aal !== "viewer") return null;
  const missing = rooms.filter((r) => !(req.viewerRooms ?? []).includes(r));
  return missing.length ? { status: "not-shared", detail: `John has not shared ${missing.join(" and ")} with this read-only viewer` } : null;
}
const VIEWER_NEVER = (what: string): Read<never> => ({ status: "not-shared", detail: `the ${what} is never shared with a read-only viewer` });
/** Most rows one PostgREST read returns; a full page means the log may be cut off. */
export const USAGE_PAGE = 1000;

async function readBudget(req: AnalyticsRequest, ownerId: string | null): Promise<Read<BudgetStatus>> {
  // The meter is keyed by the owner's id; a read-only viewer token would ask about the wrong account and get a misleading 0.
  if (req.aal === "viewer") return VIEWER_NEVER("AI budget meter");
  if (!ownerId) return failed("owner id unavailable");
  const res = await req.rest(req.config, req.token, "rpc/manager_budget_status", { method: "POST", body: JSON.stringify({ _owner_id: ownerId }) }).catch(() => null);
  const row = res?.ok ? (Array.isArray(res.body) ? res.body[0] : res.body) as Row | undefined : undefined;
  if (!row || typeof row !== "object") return failed(res ? `budget meter replied ${res.status}` : undefined);
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN);
  const data = { usedCents: n(row["used_cents"]), ceilingCents: n(row["ceiling_cents"]), warnCents: n(row["warn_cents"]), paused: row["paused"] === true, warning: row["warning"] === true };
  return [data.usedCents, data.ceilingCents, data.warnCents].every(Number.isFinite) ? { status: "read", at: at(), data } : failed("budget meter reply was not readable");
}

async function readUsage(req: AnalyticsRequest, now: Date): Promise<Read<UsageRow[]>> {
  // ai_usage has no viewer read policy at all.
  if (req.aal === "viewer") return VIEWER_NEVER("AI call log");
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const r = await rows(req, `ai_usage?select=at,estimated_cents,outcome&at=gte.${encodeURIComponent(start)}&order=at.desc&limit=${USAGE_PAGE}`);
  if (r.status !== "read") return r;
  // A full page may be cut off by the database's row cap; partial counts are never shown as complete ones.
  if (r.data.length >= USAGE_PAGE) return failed(`the call log has ${USAGE_PAGE} or more calls this month, more than one read returns, so counts would be incomplete`);
  if (r.data.some((u) => typeof u["estimated_cents"] !== "number")) return failed("a call log row had no readable cost estimate");
  return { status: "read", at: r.at, data: r.data.map((u) => ({ at: text(u["at"], 40), cents: u["estimated_cents"] as number, outcome: text(u["outcome"], 20) })).filter((u) => u.at).reverse() };
}

async function readFinance(req: AnalyticsRequest): Promise<Read<FinanceData>> {
  if (!twoStep(req.aal)) return { status: "denied", detail: "needs two-step verification" };
  const gate = notSharedFor(req, ["/finance"]);
  if (gate) return gate;
  // Same normalisation as the Finance room: saved doc receipts + email-ingested receipts, de-duplicated.
  let r = await rows(req, "finance_receipts?select=doc,ingested_receipts,updated_at&order=created_at.desc&limit=1");
  let ingestedReadable = true;
  if (r.status !== "read") { r = await rows(req, "finance_receipts?select=doc,updated_at&order=created_at.desc&limit=1"); ingestedReadable = false; }
  if (r.status !== "read") return r;
  const row = r.data[0];
  if (!row) return { status: "read", at: r.at, data: { receipts: [], subscriptions: [], updatedAt: null } };
  const { parseReceiptImport, mergeReceipts, toExportDocument } = await import("./finance-receipts");
  const { cleanSubscriptionList } = await import("./subscriptions");
  const doc = row["doc"] && typeof row["doc"] === "object" ? (row["doc"] as Row) : null;
  const saved = doc ? parseReceiptImport(JSON.stringify(doc)) : null;
  const ingestedRows = ingestedReadable && Array.isArray(row["ingested_receipts"]) ? row["ingested_receipts"] : [];
  const ingested = parseReceiptImport(JSON.stringify(toExportDocument(ingestedRows as never)));
  const receipts = mergeReceipts(saved?.ok ? saved.receipts : [], ingested.ok ? ingested.receipts : []).merged;
  const subscriptions = (doc ? cleanSubscriptionList(doc["subscriptions"]) : null) ?? [];
  return { status: "read", at: r.at, data: { receipts, subscriptions, updatedAt: text(row["updated_at"], 40) || null, ...(ingestedReadable ? {} : { partial: "Email-ingested receipts could not be read, so totals may be low." }) } };
}

async function readProjects(req: AnalyticsRequest): Promise<Read<ProjectRow[]>> {
  if (!twoStep(req.aal)) return { status: "denied", detail: "needs two-step verification" };
  // The register joins saved project notes with Work Board tasks.
  const gate = notSharedFor(req, ["/projects", "/work-board"]);
  if (gate) return gate;
  const { readLocatorsWith } = await import("./project-register.functions");
  const loc = await readLocatorsWith((p, i) => req.rest(req.config, req.token, p, i)).catch(() => null);
  if (!loc) return failed();
  return { status: "read", at: at(), data: loc.locators.map((l) => ({ name: text(l.project.name, 120), stage: text(l.stage, 40), nextMove: text(l.nextMove, 200) })) };
}

async function readRuns(req: AnalyticsRequest, workflow: string): Promise<Read<BuildRun[]>> {
  // The Office GitHub credential is only used for a viewer that was shown Build & Testing.
  const gate = notSharedFor(req, ["/build-testing"]);
  if (gate) return gate;
  if (!req.github) return { status: "not-configured", detail: "the Office server has no GitHub read connection configured" };
  const res = await req.github(`/repos/${OFFICE_REPO}/actions/workflows/${workflow}/runs?per_page=100&event=workflow_dispatch`).catch(() => null);
  const list = res?.ok && res.body && typeof res.body === "object" ? (res.body as Row)["workflow_runs"] : null;
  if (!Array.isArray(list)) return failed(res ? `GitHub replied ${res.status}` : "GitHub could not be reached");
  return {
    status: "read", at: at(),
    data: (list as Row[]).map((r) => ({
      id: Number(r["id"]),
      state: r["status"] === "completed" ? text(r["conclusion"], 20) || "unknown" : text(r["status"], 20) || "unknown",
      createdAt: text(r["created_at"], 40), startedAt: text(r["run_started_at"], 40) || null, updatedAt: text(r["updated_at"], 40) || null,
      title: text(r["display_title"], 120),
    })).filter((r) => Number.isSafeInteger(r.id) && r.id > 0),
  };
}

function ownerIdFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Row;
    return typeof json["sub"] === "string" ? json["sub"] : null;
  } catch { return null; }
}

/** Reads every Analytics source in parallel. Never throws; each source reports its own status. */
export async function readAnalyticsRawWith(req: AnalyticsRequest, ownerId: string | null = ownerIdFromToken(req.token)): Promise<AnalyticsRaw> {
  const now = req.now?.() ?? new Date();
  const safe = <T>(p: Promise<Read<T>>): Promise<Read<T>> => p.catch(() => failed());
  const gated = (room: string, path: string) => notSharedFor(req, [room]) ?? rows(req, path);
  const [tasks, approvals, changes, budget, usage, finance, projects, claude, codex] = await Promise.all([
    safe(Promise.resolve(gated("/work-board", "manager_tasks?select=id,title,status,risk,worker,project,evidence,waiting_reason,created_at,updated_at&order=updated_at.desc&limit=500"))),
    safe(Promise.resolve(gated("/approvals", "manager_approvals?select=title,status,created_at&order=created_at.desc&limit=200"))),
    safe(Promise.resolve(gated("/build-testing", "manager_changes?select=action,entity,at&entity=neq.manager_conversation&order=at.desc&limit=30"))),
    safe(readBudget(req, ownerId)),
    safe(readUsage(req, now)),
    safe(readFinance(req)),
    safe(readProjects(req)),
    safe(readRuns(req, "canx-claude.yml")),
    safe(readRuns(req, "canx-codex.yml")),
  ]);
  return { now, aal: req.aal, tasks, approvals, changes, budget, usage, finance, projects, builds: { claude, codex } };
}

/** The Office server's existing read-only GitHub connection (same credential the build panels use), or null. */
const GITHUB_CACHE_MS = 60_000;
const githubCache = new Map<string, { until: number; value: Promise<{ ok: boolean; status: number; body: unknown }> }>();

export function officeGitHubReader(token: string | undefined, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): GitHubRead | null {
  const credential = token?.trim();
  if (!credential) return null;
  return async (path) => {
    // Only Actions run lists for the Office repository are ever read here.
    if (!new RegExp(`^/repos/${OFFICE_REPO}/actions/workflows/canx-(claude|codex)\\.yml/runs\\?`).test(path)) return { ok: false, status: 400, body: null };
    // Every room view, refresh and Elsie request reads this; one GitHub read per minute per list is plenty.
    const hit = githubCache.get(path);
    if (hit && hit.until > now()) return hit.value;
    const value = fetchRuns(path, credential, fetchImpl);
    githubCache.set(path, { until: now() + GITHUB_CACHE_MS, value });
    const res = await value.catch(() => null);
    if (!res?.ok) githubCache.delete(path);
    if (!res) throw new Error("GitHub could not be reached");
    return res;
  };
}
/** Test hook: forget cached GitHub run lists. */
export const clearGitHubRunCache = () => githubCache.clear();

async function fetchRuns(path: string, credential: string, fetchImpl: typeof fetch) {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "CanX-Office-analytics", Accept: "application/vnd.github+json", Authorization: `Bearer ${credential}`, "X-GitHub-Api-Version": "2026-03-10" },
  });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
}
