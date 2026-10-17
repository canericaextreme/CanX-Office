import { describe, expect, it, vi } from "vitest";
import { USAGE_PAGE, clearGitHubRunCache, officeGitHubReader, readAnalyticsRawWith, type AnalyticsRest } from "./analytics-overview.server";
import { readRoomSnapshotWith } from "./room-snapshot.server";
import { roomTargetForRoute, snapshotForModel } from "./room-snapshot";

const config = { url: "https://db.test", publishableKey: "pk" };
// header.payload.signature with sub = owner-1
const TOKEN = `x.${btoa(JSON.stringify({ sub: "owner-1" }))}.y`;
const NOW = () => new Date("2026-10-17T00:30:00Z");

function fakeRest(fail: string[] = [], empty = false) {
  const calls: string[] = [];
  const rest: AnalyticsRest = async (_c, _t, path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (fail.some((f) => path.startsWith(f))) return { ok: false, status: 500, body: null };
    // Viewer row security hides rows instead of refusing: every unshared table just looks empty.
    if (empty) return { ok: true, status: 200, body: [] };
    if (path.startsWith("rpc/manager_budget_status")) return { ok: true, status: 200, body: [{ used_cents: 1200, ceiling_cents: 10000, warn_cents: 7500, paused: false, warning: false }] };
    if (path.startsWith("ai_usage")) return { ok: true, status: 200, body: [{ at: "2026-10-03T00:00:00Z", estimated_cents: 4, outcome: "ok" }] };
    if (path.startsWith("finance_receipts")) return { ok: true, status: 200, body: [{ doc: { kind: "canx-finance-receipts", schemaVersion: 1, receipts: [{ id: "r1", vendor: "V", date: "2026-10-04", total: 12.5, currency: "CAD", reviewStatus: "reviewed" }], subscriptions: [] }, ingested_receipts: [], updated_at: "2026-10-16T00:00:00Z" }] };
    if (path.startsWith("manager_tasks")) return { ok: true, status: 200, body: [{ id: "t1", title: "A task", status: "open", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", evidence: "" }] };
    return { ok: true, status: 200, body: [] };
  };
  return { rest, calls };
}
const github = vi.fn(async (path: string) => ({ ok: true, status: 200, body: { workflow_runs: [{ id: 5, status: "completed", conclusion: "success", created_at: "2026-10-16T04:35:09Z", run_started_at: "2026-10-16T04:35:09Z", updated_at: "2026-10-16T04:38:19Z", display_title: path.includes("claude") ? "CanX Claude build 7" : "CanX Codex build 26" }] } }));

describe("Analytics reader", () => {
  it("reads every source read-only and parses the Finance document like the Finance room", async () => {
    const { rest, calls } = fakeRest();
    const raw = await readAnalyticsRawWith({ config, token: TOKEN, aal: "aal2", rest, github, now: NOW });
    expect(calls.every((c) => c.startsWith("GET ") || c === "POST rpc/manager_budget_status")).toBe(true);
    expect(raw.budget).toMatchObject({ status: "read", data: { usedCents: 1200, ceilingCents: 10000 } });
    expect(raw.usage).toMatchObject({ status: "read", data: [{ cents: 4, outcome: "ok" }] });
    expect(calls.find((c) => c.includes("ai_usage"))).toContain("at=gte.2026-10-01T00%3A00%3A00.000Z");
    expect(raw.finance.status === "read" && raw.finance.data.receipts[0]?.total).toBe(12.5);
    expect(raw.builds.claude).toMatchObject({ status: "read", data: [{ id: 5, state: "success", title: "CanX Claude build 7" }] });
  });

  it("does not read Finance or projects without two-step, and never asks the meter about a viewer", async () => {
    const { rest, calls } = fakeRest();
    const raw = await readAnalyticsRawWith({ config, token: TOKEN, aal: "aal1", rest, github, now: NOW });
    expect(raw.finance.status).toBe("denied");
    expect(raw.projects.status).toBe("denied");
    expect(calls.some((c) => c.includes("finance_receipts"))).toBe(false);
    const viewer = fakeRest();
    const v = await readAnalyticsRawWith({ config, token: TOKEN, aal: "viewer", viewerRooms: ["/analytics", "/work-board", "/finance"], rest: viewer.rest, github, now: NOW });
    expect(v.budget.status).toBe("not-shared");
    expect(viewer.calls.some((c) => c.includes("manager_budget_status"))).toBe(false);
  });

  it("a viewer only gets sources whose rooms were shared, so hidden rows never read as zero", async () => {
    const { rest, calls } = fakeRest([], true);
    github.mockClear();
    const raw = await readAnalyticsRawWith({ config, token: TOKEN, aal: "viewer", viewerRooms: ["/analytics", "/work-board"], rest, github, now: NOW });
    expect(raw.tasks.status).toBe("read");
    for (const k of ["approvals", "changes", "budget", "usage", "finance", "projects"] as const) expect(raw[k].status, k).toBe("not-shared");
    expect(raw.builds.claude.status).toBe("not-shared");
    expect(github).not.toHaveBeenCalled(); // the Office GitHub credential is not used without Build & Testing
    expect(calls.some((c) => /ai_usage|finance_receipts|manager_approvals|manager_changes/.test(c))).toBe(false);
    const { buildAnalyticsOverview } = await import("./analytics-overview");
    const o = buildAnalyticsOverview(raw);
    const api = o.cards.find((c) => c.id === "api")!;
    expect(api.metrics.find((m) => m.label === "Office AI calls this month")).toMatchObject({ value: null, state: "not-shared" });
    expect(api.series).toEqual([]);
    expect(o.cards.find((c) => c.id === "health")!.headline.value).toBe("1 of 9 sources read just now");
    expect(o.cards.find((c) => c.id === "health")!.headline.tone).toBe("warn");
  });

  it("refuses to count a call log that may have been cut off by the row cap", async () => {
    const full: AnalyticsRest = async (_c, _t, path) => path.startsWith("ai_usage")
      ? { ok: true, status: 200, body: Array.from({ length: USAGE_PAGE }, (_, i) => ({ at: `2026-10-0${1 + (i % 9)}T00:00:00Z`, estimated_cents: 1, outcome: "ok" })) }
      : { ok: true, status: 200, body: [] };
    const raw = await readAnalyticsRawWith({ config, token: TOKEN, aal: "aal2", rest: full, github: null, now: NOW });
    expect(raw.usage.status).toBe("failed");
    const bad: AnalyticsRest = async (_c, _t, path) => ({ ok: true, status: 200, body: path.startsWith("ai_usage") ? [{ at: "2026-10-02T00:00:00Z", estimated_cents: null, outcome: "ok" }] : [] });
    expect((await readAnalyticsRawWith({ config, token: TOKEN, aal: "aal2", rest: bad, github: null, now: NOW })).usage.status).toBe("failed");
  });

  it("reports a failed source as failed and a missing GitHub connection as not configured", async () => {
    const { rest } = fakeRest(["manager_tasks", "rpc/manager_budget_status"]);
    const raw = await readAnalyticsRawWith({ config, token: TOKEN, aal: "aal2", rest, github: null, now: NOW });
    expect(raw.tasks.status).toBe("failed");
    expect(raw.budget.status).toBe("failed");
    expect(raw.builds.codex.status).toBe("not-configured");
  });

  it("the GitHub reader only ever reads the two Office builder run lists", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 }));
    clearGitHubRunCache();
    const read = officeGitHubReader(" token ", fetchImpl as unknown as typeof fetch)!;
    expect((await read("/repos/canericaextreme/CanX-Office/actions/workflows/canx-claude.yml/runs?per_page=100")).ok).toBe(true);
    expect((await read("/repos/canericaextreme/CanX-Office/actions/workflows/canx-codex.yml/dispatches?x")).ok).toBe(false);
    expect((await read("/repos/other/repo/actions/workflows/canx-claude.yml/runs?x")).ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await read("/repos/canericaextreme/CanX-Office/actions/workflows/canx-claude.yml/runs?per_page=100");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // cached for a minute: room views, refreshes and Elsie share one read
    clearGitHubRunCache();
    let t = 0;
    const timed = officeGitHubReader("token", fetchImpl as unknown as typeof fetch, () => t)!;
    const path = "/repos/canericaextreme/CanX-Office/actions/workflows/canx-claude.yml/runs?per_page=100";
    await timed(path);
    t = 59_000;
    await timed(path);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    t = 61_000;
    await timed(path);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(officeGitHubReader(undefined)).toBeNull();
    expect(officeGitHubReader("  ")).toBeNull();
  });
});

describe("Analytics room snapshot (what John's room and Elsie both read)", () => {
  it("carries the structured measurements, Elsie's text lines and the explanation procedure", async () => {
    const { rest } = fakeRest();
    const target = roomTargetForRoute("/analytics")!;
    const snap = await readRoomSnapshotWith({ config, token: TOKEN, aal: "aal2", target, rest, github, now: NOW, buildId: "index-test.js" });
    const src = snap.sources.find((s) => s.key === "analytics")!;
    expect(src.status).toBe("read");
    expect(src.analytics?.cards).toHaveLength(10);
    expect(src.items).toHaveLength(10);
    const text = snapshotForModel(snap, "current");
    expect(text).toContain("CARD Money and Budgets");
    expect(text).toContain("C$12.50 (1 receipt)");
    expect(text).toContain("Analytics room explainer (built in)");
    expect(snapshotForModel({ ...snap, route: "/finance" }, "current")).not.toContain("Analytics room explainer");
  });

  it("gives an identical fingerprint for identical data read at different times", async () => {
    const target = roomTargetForRoute("/analytics")!;
    const a = await readRoomSnapshotWith({ config, token: TOKEN, aal: "aal2", target, rest: fakeRest().rest, github, now: NOW });
    const b = await readRoomSnapshotWith({ config, token: TOKEN, aal: "aal2", target, rest: fakeRest().rest, github, now: () => new Date("2026-10-17T00:31:00Z") });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});
