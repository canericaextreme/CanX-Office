import { describe, it, expect, vi } from "vitest";
import {
  isOfficeMaintenanceRequest,
  maintenanceTaskId,
  planOfficeMaintenance,
} from "./office-maintenance";
import { runOfficeMaintenanceWith, type MaintenanceDeps } from "./office-maintenance.server";
import { ROOM_TARGETS, assembleSnapshot, type RoomSnapshot } from "./room-snapshot";

const at = "2026-10-18T01:35:00.000Z",
  buildId = "maintenance-test";
const target = ROOM_TARGETS.find((t) => t.route === "/reception")!;
function snapshot(): RoomSnapshot {
  return assembleSnapshot(
    target,
    target.sources.map((s) => ({
      ...s,
      status: "read",
      count: 0,
      items: [],
      latestAt: null,
      detail: "",
    })),
    at,
    buildId,
  );
}
function fixture() {
  const snap = snapshot();
  snap.sources[0]!.status = "failed";
  const rows = new Map<string, Record<string, unknown>>();
  const deps: MaintenanceDeps = {
    verifyOwner: vi.fn(async () => ({
      ok: true as const,
      userId: "owner-a",
      aal: "aal2" as const,
      email: "owner@example.com",
    })),
    snapshots: vi.fn(async () => new Map([[target.route, snap]])),
    now: () => at,
    rest: vi.fn(async (_token, path, init) => {
      if (init?.method === "POST") {
        const row = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (rows.has(String(row["id"]))) return { ok: false, body: null };
        rows.set(String(row["id"]), row);
        return { ok: true, body: null };
      }
      const id = /id=eq\.([^&]+)/.exec(path)?.[1] ?? "";
      return { ok: true, body: rows.has(id) ? [rows.get(id)] : [] };
    }),
  };
  return { snap, rows, deps };
}

describe("maintenance intake", () => {
  it("does not turn discussion, negation or status questions into writes", () => {
    expect(isOfficeMaintenanceRequest("Elsie, run routine office maintenance.")).toBe(true);
    for (const s of [
      "Don't run office maintenance",
      "Could you run office maintenance?",
      "Have you run office maintenance?",
      "Explain run office maintenance",
      "Run office maintenance then deploy",
    ])
      expect(isOfficeMaintenanceRequest(s)).toBe(false);
  });
  it("separates live failures, owner access, unobserved sources and incomplete coverage", () => {
    const s = snapshot();
    s.sources[0]!.status = "failed";
    s.sources[1]!.status = "denied";
    s.sources[2]!.status = "not-read";
    const p = planOfficeMaintenance(new Map([[target.route, s]]), at, buildId, [target]);
    expect(p.findings.map((f) => f.disposition)).toEqual(["diagnose", "owner-access"]);
    expect(p.incompleteRooms).toEqual([target.label]);
    expect(p.liveTested).toBe(false);
    s.checkedAt = "2026-10-17T01:35:00.000Z";
    expect(
      planOfficeMaintenance(new Map([[target.route, s]]), at, buildId, [target]).findings,
    ).toEqual([]);
  });
  it("ignores device-only absence as a repair trigger", () => {
    const t = ROOM_TARGETS.find((t) => t.route === "/health")!;
    const s = assembleSnapshot(
      t,
      t.sources.map((d) => ({
        ...d,
        status: d.kind === "device" ? "failed" : "read",
        count: 0,
        items: [],
        latestAt: null,
        detail: "",
      })),
      at,
      buildId,
    );
    const p = planOfficeMaintenance(new Map([[t.route, s]]), at, buildId, [t]);
    expect(p.findings).toEqual([]);
    expect(p.incompleteRooms).toEqual([t.label]);
  });
  it("denies before any reads or writes when owner verification fails", async () => {
    const f = fixture();
    f.deps.verifyOwner = vi.fn(async () => ({
      ok: false as const,
      reason: "no_session" as const,
      message: "Sign in",
    }));
    expect((await runOfficeMaintenanceWith(f.deps, "token", buildId)).ok).toBe(false);
    expect(f.deps.snapshots).not.toHaveBeenCalled();
    expect(f.deps.rest).not.toHaveBeenCalled();
  });
  it("parallel and repeated runs retain one diagnostic task without editing it", async () => {
    const f = fixture();
    const results = await Promise.all([
      runOfficeMaintenanceWith(f.deps, "token", buildId),
      runOfficeMaintenanceWith(f.deps, "token", buildId),
    ]);
    expect(f.rows.size).toBe(1);
    expect(results.every((r) => r.ok && r.tracked.length === 1)).toBe(true);
    const before = JSON.stringify([...f.rows]);
    await runOfficeMaintenanceWith(f.deps, "token", buildId);
    expect(JSON.stringify([...f.rows])).toBe(before);
    expect([...f.rows.values()][0]).toMatchObject({
      worker: "Elsie",
      status: "open",
      risk: "green",
    });
  });
  it("lost write acknowledgement reads the same task without retrying the write", async () => {
    const f = fixture(),
      rest = f.deps.rest;
    f.deps.rest = vi.fn(async (token, path, init) => {
      const r = await rest(token, path, init);
      if (init?.method === "POST") throw new Error("connection lost after commit");
      return r;
    });
    const r = await runOfficeMaintenanceWith(f.deps, "token", buildId);
    expect(r.ok && r.tracked.length).toBe(1);
    expect(vi.mocked(f.deps.rest).mock.calls.filter((c) => c[2]?.method === "POST")).toHaveLength(
      1,
    );
  });
  it("unreadable task lookup never causes an insert", async () => {
    const f = fixture();
    f.deps.rest = vi.fn(async () => ({ ok: false, body: [] }));
    const r = await runOfficeMaintenanceWith(f.deps, "token", buildId);
    expect(r.ok && r.unresolved.length).toBe(1);
    expect(vi.mocked(f.deps.rest).mock.calls.every((c) => !c[2])).toBe(true);
  });
  it("keeps completed records and denied sources out of automatic repairs", async () => {
    const f = fixture();
    await runOfficeMaintenanceWith(f.deps, "token", buildId);
    const row = [...f.rows.values()][0]!;
    row["status"] = "done";
    f.snap.sources[1]!.status = "denied";
    const r = await runOfficeMaintenanceWith(f.deps, "token", buildId);
    expect(r.ok && r.unresolved.length).toBe(1);
    expect(r.ok && r.tracked).toEqual([]);
    expect(f.rows.size).toBe(1);
    expect(row["status"]).toBe("done");
  });
  it("owner identity is part of the task key", () => {
    expect(maintenanceTaskId("owner-a", "files")).not.toBe(maintenanceTaskId("owner-b", "files"));
  });
});
