import { describe, expect, it } from "vitest";
import type { BackendConfig } from "./canx-backend.server";
import { collectDeviceSnapshot, deviceReportFor, sanitizeDeviceSnapshot } from "./room-device-snapshot";
import { readRoomSnapshotWith, type SnapshotRest } from "./room-snapshot.server";
import { roomTargetForRoute, snapshotForModel, assembleSnapshot } from "./room-snapshot";
import { evaluateSnapshot, statusForBuild } from "./room-connection-check";

const CONFIG = { url: "https://x.supabase.co", publishableKey: "k" } as unknown as BackendConfig;
const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });
const rest = (tables: Record<string, unknown>): SnapshotRest => async (_c, _t, path) => {
  const key = Object.keys(tables).find((k) => path.startsWith(k));
  const v = key ? tables[key] : [];
  return v === "fail" ? { ok: false, status: 500, body: null } : { ok: true, status: 200, body: v };
};
const NOW = new Date("2026-10-03T22:00:00Z");
const snap = (route: string, opts: { device?: unknown; tables?: Record<string, unknown>; build?: string } = {}) =>
  readRoomSnapshotWith({ config: CONFIG, token: "t", aal: "aal2", target: roomTargetForRoute(route)!, buildId: opts.build ?? "index-abc.js", device: sanitizeDeviceSnapshot(opts.device), rest: rest(opts.tables ?? {}), now: () => NOW });
const ok = { ran: true, ok: true, detail: "" };

describe("device sources and full coverage", () => {
  it("collects bounded device state and never secrets", () => {
    const d = collectDeviceSnapshot("/office-team", store({ "canx.office.team.v1": JSON.stringify([{ id: "a", name: "Ana", role: "Ops", room: "reception" }]), "sb-token": "SECRET" }), NOW)!;
    expect(d.route).toBe("/office-team");
    expect(JSON.stringify(d)).not.toMatch(/SECRET/);
    expect(collectDeviceSnapshot("/legal", store({}))).toBeNull();
  });
  it("a room with an unread device source is partial, never verified", async () => {
    const s = await snap("/office-team");
    expect(s.sources.find((x) => x.key === "team")).toMatchObject({ status: "not-read" });
    expect(s.sources.find((x) => x.key === "team")!.detail).toMatch(/device-unavailable/);
    const rec = evaluateSnapshot(s, ok);
    expect(rec.status).toBe("partial"); expect(rec.coverage).toBe("partial"); expect(rec.sharedReaderOk).toBe(true);
  });
  it("a fresh device report for the same room makes coverage full", async () => {
    const device = { route: "/office-team", collectedAt: NOW.toISOString(), sources: { team: { count: 2, items: ["Ana — Ops"], detail: "saved" } } };
    const s = await snap("/office-team", { device });
    expect(s.sources.find((x) => x.key === "team")).toMatchObject({ status: "read", count: 2 });
    expect(snapshotForModel(s, "current")).toMatch(/untrusted device data/);
    expect(evaluateSnapshot(s, ok)).toMatchObject({ status: "verified", coverage: "full" });
  });
  it("stale or other-room device reports are rejected", () => {
    const old = sanitizeDeviceSnapshot({ route: "/office-team", collectedAt: "2026-10-03T20:00:00Z", sources: { team: { count: 1 } } });
    expect(deviceReportFor(old, "/office-team", "team", NOW).ok).toBe(false);
    expect(deviceReportFor(sanitizeDeviceSnapshot({ route: "/legal", collectedAt: NOW.toISOString(), sources: {} }), "/office-team", "team", NOW).ok).toBe(false);
  });
  it("an unknown build never counts as verified", async () => {
    const s = await snap("/legal", { build: "unknown" });
    const rec = evaluateSnapshot(s, ok);
    expect(rec.status).toBe("partial"); expect(rec.failure).toMatch(/Build version unknown/);
    expect(statusForBuild({ ...rec, status: "verified" }, "unknown")).toBe("partial");
  });
  it("Future is reserved, not verified", () => {
    expect(evaluateSnapshot(assembleSnapshot(roomTargetForRoute("/future")!, [], NOW.toISOString(), "x.js"), ok).status).toBe("reserved");
  });
  it("a failed table is never empty-green", async () => {
    const s = await snap("/legal", { tables: { office_files: "fail" } });
    expect(s.sources.find((x) => x.key === "files")!.status).toBe("failed");
    expect(evaluateSnapshot(s, ok).status).not.toBe("verified");
  });
  it("capped reads say 'up to', not a total", async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ title: `t${i}`, status: "open", updated_at: "2026-10-03" }));
    const s = await snap("/work-board", { tables: { manager_tasks: many } });
    expect(s.sources.find((x) => x.key === "tasks")).toMatchObject({ capped: true, count: 100 });
    expect(snapshotForModel(s, "current")).toMatch(/showing up to 100/);
  });
  it("Finance counts include email-ingested receipts, and say so when they can't be read", async () => {
    const both = await snap("/finance", { tables: { finance_receipts: [{ doc: { receipts: [] }, ingested_receipts: [{}, {}], updated_at: "u" }] } });
    expect(both.sources.find((x) => x.key === "finance-receipts")!.count).toBe(2);
    let n = 0;
    const s = await readRoomSnapshotWith({ config: CONFIG, token: "t", aal: "aal2", target: roomTargetForRoute("/finance")!, buildId: "b.js", rest: async (_c, _t, p) => (p.includes("ingested_receipts") ? { ok: false, status: 400, body: null } : (n++, { ok: true, status: 200, body: [{ doc: { receipts: [] }, updated_at: "u" }] })), now: () => NOW });
    expect(s.sources.find((x) => x.key === "finance-receipts")!.detail).toMatch(/could NOT be read/);
    expect(n).toBeGreaterThan(0);
  });
});
