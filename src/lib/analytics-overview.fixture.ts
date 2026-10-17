/** Test fixture for the Analytics room: realistic raw readings, shaped like the live Office records. Not used by the app. */
import type { AnalyticsRaw, BuildRun, Read } from "./analytics-overview";
import type { FinanceReceipt } from "./finance-receipts";
import type { SubscriptionRecord } from "./subscriptions";

const NOW = new Date("2026-10-17T00:30:00Z");
const AT = "2026-10-17T00:30:00.000Z";
const ok = <T,>(data: T): Read<T> => ({ status: "read", at: AT, data });
export const fail = { status: "failed", detail: "database replied 500" } as const;

const receipt = (over: Partial<FinanceReceipt>): FinanceReceipt => ({
  id: Math.random().toString(36), vendor: "Vendor", description: "", orderNumber: "", date: "2026-10-05", subtotal: null, tax: null, total: 40, currency: "CAD",
  currencySymbol: "$", category: "", reviewStatus: "reviewed", paymentStatus: "paid", businessUsePercent: null, notes: "", sourceMessageIds: [], sourceUrl: "",
  duplicateCount: 1, sourceEmailText: "", receivedAt: "", importedAt: AT, ...over,
});
const sub = (over: Partial<SubscriptionRecord>): SubscriptionRecord => ({
  id: Math.random().toString(36), name: "Service", aliases: [], senderDomains: [], scope: "office", cadence: "monthly", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: AT, ...over,
});
const run = (id: number, state: string, mins: number, title: string): BuildRun => ({
  id, state, title, createdAt: `2026-10-1${id % 7}T10:00:00Z`, startedAt: `2026-10-1${id % 7}T10:00:00Z`, updatedAt: new Date(Date.parse(`2026-10-1${id % 7}T10:00:00Z`) + mins * 60_000).toISOString(),
});

export function fixtureRaw(over: Partial<AnalyticsRaw> = {}): AnalyticsRaw {
  return {
    now: NOW,
    aal: "aal2",
    tasks: ok([
      { id: "t1", title: "Tidy Finance headings", status: "open", project: "CanX Office", created_at: "2026-10-16T03:57:49Z", updated_at: "2026-10-16T18:43:03Z",
        evidence: JSON.stringify({ kind: "office-task-v2", builder: "claude", state: "failure", prior: "[elsie-queue claude 2026-10-16T03:57:50Z]", runId: 102 }) },
      { id: "t2", title: "Queue test", status: "in_progress", project: "CanX Office", created_at: "2026-10-16T04:35:07Z", updated_at: "2026-10-16T05:00:52Z",
        evidence: JSON.stringify({ kind: "office-task-v2", builder: "claude", state: "queued", prior: "", runId: 103 }) },
      { id: "t3", title: "Old stalled job", status: "in_progress", project: "Subscription Watch", created_at: "2026-09-11T02:37:31Z", updated_at: "2026-09-11T02:37:32Z", evidence: "" },
      { id: "t4", title: "Launch book", status: "waiting", project: "Best Sandwich Ever", waiting_reason: "Listing verification", created_at: "2026-09-24T03:47:42Z", updated_at: "2026-10-03T00:53:48Z", evidence: "" },
      { id: "t5", title: "Help text", status: "done", project: "CanX Office", created_at: "2026-10-02T23:09:02Z", updated_at: "2026-10-02T23:42:42Z", evidence: "Build run 1 succeeded." },
      { id: "t6", title: "Stalled field", status: "open", project: "CanX Office", created_at: "2026-10-02T21:38:28Z", updated_at: "2026-10-02T21:38:29Z", evidence: "Codex handoff 2026-10-02T21:38:29.231Z: not confirmed — check Build & Testing." },
    ]),
    approvals: ok([{ title: "Connect read-only billing", status: "pending", created_at: AT }, { title: "Old", status: "approved", created_at: AT }]),
    changes: ok([{ action: "task.update", entity: "manager_tasks", at: "2026-10-16T21:47:26Z" }]),
    budget: ok({ usedCents: 2500, ceilingCents: 10000, warnCents: 7500, paused: false, warning: false }),
    usage: ok([
      { at: "2026-10-01T10:00:00Z", cents: 5, outcome: "ok" }, { at: "2026-10-16T04:09:00Z", cents: 3, outcome: "failed" },
      { at: "2026-10-16T05:00:00Z", cents: 7, outcome: "ok" }, { at: "2026-09-30T23:00:00Z", cents: 99, outcome: "ok" },
    ]),
    finance: ok({
      receipts: [receipt({ total: 40 }), receipt({ total: 60, date: "2026-10-09" }), receipt({ total: 500, reviewStatus: "excluded" }), receipt({ total: 30, date: "2026-09-12" })],
      subscriptions: [sub({ name: "Supabase", knownCost: { amount: 25, currency: "USD", asOf: AT, source: "owner" }, nextRenewal: { date: "2026-10-20", basis: "explicit", source: "owner" } }), sub({ name: "Mystery" }), sub({ name: "Personal", scope: "personal", knownCost: { amount: 9, currency: "CAD", asOf: AT, source: "owner" } })],
      updatedAt: "2026-10-16T05:00:00Z",
    }),
    builds: {
      claude: ok([run(103, "success", 3.2, "CanX Claude build 7"), run(102, "failure", 3.1, "CanX Claude build 6"), run(101, "failure", 3.9, "CanX Claude build 5"), run(100, "success", 3.3, "CanX Claude build 4")]),
      codex: ok([run(206, "success", 3.0, "CanX Codex build 26"), run(205, "success", 5.5, "CanX Codex build 25"), run(204, "failure", 5.9, "CanX Codex build 23")]),
    },
    projects: ok([{ name: "Safe Highways Canada", stage: "building", nextMove: "Audit public app" }, { name: "Trails & Tales", stage: "unknown", nextMove: "" }]),
    ...over,
  };
}

