import { describe, expect, it, vi } from "vitest";
import { officeGitHubReader, readAnalyticsRawWith, type AnalyticsRest } from "./analytics-overview.server";
import { readRoomSnapshotWith } from "./room-snapshot.server";
import { roomTargetForRoute, snapshotForModel } from "./room-snapshot";

const config = { url: "https://db.test", publishableKey: "pk" };
// header.payload.signature with sub = owner-1
const TOKEN = `x.${btoa(JSON.stringify({ sub: "owner-1" }))}.y`;
const NOW = () => new Date("2026-10-17T00:30:00Z");

function fakeRest(fail: string[] = []) {
  const calls: string[] = [];
  const rest: AnalyticsRest = async (_c, _t, path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (fail.some((f) => path.startsWith(f))) return { ok: false, status: 500, body: null };
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
    const v = await readAnalyticsRawWith({ config, token: TOKEN, aal: "viewer", rest: viewer.rest, github, now: NOW });
    expect(v.budget.status).toBe("failed");
    expect(viewer.calls.some((c) => c.includes("manager_budget_status"))).toBe(false);
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
    const read = officeGitHubReader(" token ", fetchImpl as unknown as typeof fetch)!;
    expect((await read("/repos/canericaextreme/CanX-Office/actions/workflows/canx-claude.yml/runs?per_page=100")).ok).toBe(true);
    expect((await read("/repos/canericaextreme/CanX-Office/actions/workflows/canx-codex.yml/dispatches?x")).ok).toBe(false);
    expect((await read("/repos/other/repo/actions/workflows/canx-claude.yml/runs?x")).ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
