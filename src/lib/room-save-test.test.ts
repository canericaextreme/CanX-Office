import { describe, it, expect } from "vitest";
import { readRoomReportPresenceWith, readRoomSnapshotWith, type SnapshotRest } from "./room-snapshot.server";
import { roomTargetForRoute } from "./room-snapshot";
import { roomReportSource } from "./manager-room-commands";
import { runReportSaveTest } from "./room-connection-check";
import type { BackendConfig } from "./canx-backend.server";

const CONFIG = { url: "https://x", publishableKey: "pk" } as BackendConfig;
const target = roomTargetForRoute("/legal")!;
const SRC = roomReportSource(target.id);
type Note = { id: string; title: string; source: string; created_at: string };

/** In-memory office_notes honouring id/source filters, select, order desc and limit — like PostgREST. */
function store(seed: Note[], opts: { failReads?: number[]; failDelete?: boolean; onRead?: (n: number, rows: Note[]) => void } = {}) {
  const rows = [...seed];
  let reads = 0;
  const rest: SnapshotRest = async (_c, _t, path, init) => {
    const [table, q = ""] = path.split("?");
    const p = new URLSearchParams(q);
    if (init?.method === "DELETE") {
      if (opts.failDelete) return { ok: false, status: 500, body: null };
      const id = p.get("id")!.slice(3); const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1);
      return { ok: true, status: 204, body: null };
    }
    if (table !== "office_notes") return { ok: true, status: 200, body: [] };
    reads++;
    opts.onRead?.(reads, rows);
    if (opts.failReads?.includes(reads)) return { ok: false, status: 500, body: null };
    let out = rows.filter((r) => (!p.get("id") || r.id === p.get("id")!.slice(3)) && (!p.get("source") || r.source === p.get("source")!.slice(3)));
    out = [...out].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Number(p.get("limit") ?? 1000));
    const sel = p.get("select")?.split(",");
    return { ok: true, status: 200, body: sel ? out.map((r) => Object.fromEntries(sel.map((c) => [c, (r as Record<string, unknown>)[c]]))) : out };
  };
  return { rows, rest };
}
const ID = "11111111-2222-4333-8444-555555555555";
const TITLE = `[TEST] Room connection check 2026-10-03T22:10:00.000Z — temporary, auto-removed`;
const many = (n: number): Note[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Report ${i}`, source: SRC, created_at: `2026-10-03T21:${String(i % 60).padStart(2, "0")}:00Z` }));

function harness(s: ReturnType<typeof store>, save = true) {
  return runReportSaveTest({
    save: async () => { if (save) s.rows.push({ id: ID, title: TITLE, source: SRC, created_at: "2026-10-03T22:10:00Z" }); return save; },
    presence: () => readRoomReportPresenceWith({ config: CONFIG, token: "t", rest: s.rest, roomId: target.id, id: ID }),
    remove: async () => { const r = await s.rest(CONFIG, "t", `office_notes?id=eq.${ID}`, { method: "DELETE" }); return r.ok; },
  });
}

describe("reversible save test uses the exact record ID", () => {
  it("cause: the real reports formatter adds the date (and truncates), so the old exact-title test could never match", async () => {
    const s = store([{ id: ID, title: TITLE + " ".repeat(5) + "x".repeat(200), source: SRC, created_at: "2026-10-03T22:10:00Z" }]);
    const snap = await readRoomSnapshotWith({ config: CONFIG, token: "t", aal: "aal2", target, rest: s.rest });
    const items = snap.sources.find((x) => x.key === "reports")!.items;
    expect(items[0]).toMatch(/\(2026-10-03\)$/);
    expect(items.includes(TITLE)).toBe(false);
  });
  it("saved → seen by ID → removed → confirmed gone (passes)", async () => {
    const s = store(many(3));
    expect(await harness(s)).toMatchObject({ ok: true });
    expect(s.rows.some((r) => r.id === ID)).toBe(false);
    expect(s.rows).toHaveLength(3); // unrelated reports untouched
  });
  it("capped list (100+ reports) still verifies by ID", async () => {
    const s = store(many(150));
    expect(await harness(s)).toMatchObject({ ok: true });
  });
  it("unrelated concurrent change does not break or fake the result", async () => {
    const s = store(many(2), { onRead: (n, rows) => { if (n === 1) rows.push({ id: "other", title: "John's new report", source: SRC, created_at: "2026-10-03T22:11:00Z" }); } });
    expect(await harness(s)).toMatchObject({ ok: true });
    expect(s.rows.some((r) => r.id === "other")).toBe(true);
  });
  it("failed re-read is reported as a read failure and cleanup still happens", async () => {
    const s = store([], { failReads: [1] });
    const r = await harness(s);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/re-read by record ID failed.*Temporary report removed/);
    expect(s.rows.some((x) => x.id === ID)).toBe(false);
  });
  it("cleanup failure is reported, never green", async () => {
    const s = store([], { failDelete: true });
    const r = await harness(s);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Removal could not be confirmed/);
  });
  it("failed read after removal is not treated as gone", async () => {
    const s = store([], { failReads: [2] });
    const r = await harness(s);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Removal could not be confirmed/);
  });
  it("record not found after save fails honestly", async () => {
    const s = store([]);
    const r = await runReportSaveTest({ save: async () => true, presence: () => readRoomReportPresenceWith({ config: CONFIG, token: "t", rest: s.rest, roomId: target.id, id: ID }), remove: async () => true });
    expect(r).toMatchObject({ ok: false });
    expect(r.detail).toMatch(/not found on re-read/);
  });
  it("a report with the same ID in another room's source does not count", async () => {
    const s = store([{ id: ID, title: TITLE, source: roomReportSource("finance"), created_at: "1" }]);
    expect(await readRoomReportPresenceWith({ config: CONFIG, token: "t", rest: s.rest, roomId: target.id, id: ID })).toBe("absent");
  });
});
