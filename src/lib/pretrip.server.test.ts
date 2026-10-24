import { describe, expect, it, vi } from "vitest";
import { runPreTripWith, readPreTripForElsie, type PreTripDeps } from "./pretrip.server";
import { PRETRIP_SCHEMA, type ColleagueTest } from "./pretrip";
import type { RoomSnapshot, RoomTarget } from "./room-snapshot";

const OWNER = "8af1ed9b-4ac8-45a9-8d95-2eebf31f5c76";
type Res = { ok: boolean; status: number; body: unknown };

function fakeOffice(opts: { notes?: Record<string, unknown>[]; failBrain?: boolean; postStatus?: number } = {}) {
  const saved: Record<string, unknown>[] = [...(opts.notes ?? [])];
  const calls: string[] = [];
  const rest = vi.fn(async (path: string, init?: RequestInit): Promise<Res> => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (init?.method === "POST" && path === "office_notes") {
      if (opts.postStatus) return { ok: false, status: opts.postStatus, body: null };
      saved.push(JSON.parse(String(init.body)));
      return { ok: true, status: 201, body: null };
    }
    if (path.startsWith("rpc/manager_budget_status")) return { ok: true, status: 200, body: [{ used_cents: 120, ceiling_cents: 5000, warn_cents: 4000, paused: false, warning: false }] };
    if (path.startsWith("manager_tasks")) return { ok: true, status: 200, body: [
      { id: "t1", title: "Fix ChatGPT visual connection", status: "in_progress", updated_at: "2026-10-20T00:00:00Z" },
      { id: "t2", title: "Other", status: "waiting", updated_at: "2026-10-24T00:00:00Z" },
    ] };
    if (path.startsWith("manager_approvals")) return { ok: true, status: 200, body: [{ id: "a1" }] };
    if (path.startsWith("astra_conversation_summaries")) return { ok: true, status: 200, body: [{ summary: "Worked on ChatGPT pictures.", open_loops: ["x"], updated_at: "2026-10-23T22:00:00Z" }] };
    if (path.startsWith("astra_recent_context")) return { ok: true, status: 200, body: [{ created_at: "2026-10-23T23:00:00Z" }] };
    if (path.startsWith("office_notes")) {
      if (opts.failBrain && path.includes("order=updated_at.desc")) return { ok: false, status: 500, body: null };
      if (path.includes("id=like.pretrip-2*")) {
        const cut = /id=lt\.pretrip-(\d{8})/.exec(path)?.[1];
        return { ok: true, status: 200, body: saved.filter((n) => String(n["id"]).startsWith("pretrip-") && (!cut || String(n["id"]) < `pretrip-${cut}`)) };
      }
      if (path.includes("id=eq.pretrip-")) {
        const id = decodeURIComponent(/&id=eq\.([^&]+)/.exec(path)![1]!);
        return { ok: true, status: 200, body: saved.filter((n) => n["id"] === id) };
      }
      if (path.includes("email-sweep-receipt-20261024")) return { ok: true, status: 200, body: [{ id: "email-sweep-receipt-20261024", title: "Email sweep 24 Oct", updated_at: "2026-10-24T13:05:00Z" }] };
      if (path.includes("email-ledger-20261024")) return { ok: true, status: 200, body: [{ detail: JSON.stringify([{ outcome: { status: "review-queued" } }, { outcome: { status: "nonoffice-promotion" } }]) }] };
      if (path.includes("handoff-latest")) return { ok: true, status: 200, body: [{ id: "handoff-latest-claude", updated_at: "2026-10-24T00:57:00Z" }] };
      return { ok: true, status: 200, body: [{ id: "n1", updated_at: "2026-10-24T01:00:00Z" }] };
    }
    return { ok: false, status: 404, body: null };
  });
  return { rest, saved, calls };
}

const room = (t: RoomTarget): Promise<RoomSnapshot> => Promise.resolve({ route: t.route, label: t.label, sources: [{ key: "files", label: "Files", kind: "live", status: "read" }] } as unknown as RoomSnapshot);
const passing = async (c: "chatgpt" | "claude"): Promise<ColleagueTest> => ({ colleague: c, sent: true, replied: true, verified: true, ms: 900, responseId: "r1", model: "m", failure: null });

const deps = (o: ReturnType<typeof fakeOffice>, extra: Partial<PreTripDeps> = {}): PreTripDeps => ({
  rest: o.rest, readRoom: room, ping: passing, ownerId: OWNER, aal: "aal2",
  now: () => new Date("2026-10-24T15:00:00Z"), randomCode: () => "ABC123", ...extra,
});

describe("runPreTripWith", () => {
  it("runs every check, saves one dated record and reads it back", async () => {
    const o = fakeOffice();
    const r = await runPreTripWith(deps(o), "daily");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.saved).toBe(true);
    expect(r.record.id).toBe("pretrip-20261024-daily");
    expect(r.record.rooms).toEqual({ total: 24, verified: 24 });
    expect(r.record.checks.find((c) => c.id === "colleague:chatgpt")?.status).toBe("green");
    expect(r.record.checks.find((c) => c.id === "native:claude")?.status).toBe("unverified");
    expect(r.record.checks.find((c) => c.id === "work-board")?.status).toBe("yellow"); // t1 stalled 4+ days
    expect(r.record.email).toMatchObject({ needsAttention: 1, archive: 1 });
    expect(r.record.approvals).toBe(1);
    expect(r.record.overall).toBe("yellow"); // backups/workers/native are never green
    expect(o.saved).toHaveLength(1);
    expect(o.calls.filter((c) => c.startsWith("POST office_notes"))).toHaveLength(1);
  });

  it("never runs the daily inspection twice on the same day", async () => {
    const o = fakeOffice();
    await runPreTripWith(deps(o), "daily");
    const again = await runPreTripWith(deps(o, { now: () => new Date("2026-10-24T20:00:00Z") }), "daily");
    expect(again.ok && again.repeated).toBe(true);
    expect(o.saved).toHaveLength(1);
  });

  it("makes a new manual record later the same day without overwriting, but not for a quick repeat", async () => {
    const o = fakeOffice();
    await runPreTripWith(deps(o), "daily");
    const quick = await runPreTripWith(deps(o, { now: () => new Date("2026-10-24T15:01:00Z") }), "manual");
    expect(quick.ok && quick.repeated).toBe(true);
    const later = await runPreTripWith(deps(o, { now: () => new Date("2026-10-24T18:00:00Z") }), "manual");
    expect(later.ok && !later.repeated && later.record.id).toBe("pretrip-20261024-manual-180000");
    expect(o.saved.map((n) => n["id"])).toEqual(["pretrip-20261024-daily", "pretrip-20261024-manual-180000"]);
  });

  it("marks a hung check unverified and still finishes", async () => {
    const o = fakeOffice();
    const r = await runPreTripWith(deps(o, { readRoom: () => new Promise(() => undefined), checkTimeoutMs: 1_000 }), "daily");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.inspection).toBe("partial");
    expect(r.record.rooms.verified).toBe(0);
    expect(r.record.checks.find((c) => c.id === "room:/reception")?.status).toBe("unverified");
  });

  it("reports a failed colleague test with where it failed, and no ping when not wired", async () => {
    const o = fakeOffice();
    const failing = async (c: "chatgpt" | "claude"): Promise<ColleagueTest> => ({ colleague: c, sent: true, replied: false, verified: false, ms: 20000, responseId: null, model: "m", failure: "timed out after 20 s" });
    const r = await runPreTripWith(deps(o, { ping: failing }), "daily");
    expect(r.ok && r.record.checks.find((c) => c.id === "colleague:claude")?.detail).toContain("timed out");
    const o2 = fakeOffice();
    const r2 = await runPreTripWith(deps(o2, { ping: undefined }), "daily");
    expect(r2.ok && r2.record.checks.find((c) => c.id === "colleague:chatgpt")?.status).toBe("unverified");
  });

  it("carries yesterday's problems forward", async () => {
    const yesterday = { id: "pretrip-20261023-daily", detail: JSON.stringify({ schema: PRETRIP_SCHEMA, id: "pretrip-20261023-daily", date: "2026-10-23", finishedAt: "2026-10-23T15:00:00Z", checks: [{ id: "work-board", area: "Work Board", label: "Work Board", status: "yellow", detail: "", since: "2026-10-22" }] }) };
    const o = fakeOffice({ notes: [yesterday] });
    const r = await runPreTripWith(deps(o), "daily");
    expect(r.ok && r.record.previousId).toBe("pretrip-20261023-daily");
    expect(r.ok && r.record.checks.find((c) => c.id === "work-board")?.since).toBe("2026-10-22");
    expect(r.ok && r.record.changes.newProblems).not.toContain("Work Board");
  });

  it("says plainly when the save fails instead of claiming it", async () => {
    const r = await runPreTripWith(deps(fakeOffice({ postStatus: 500 })), "manual");
    expect(r.ok && r.saved).toBe(false);
    expect(r.ok && r.detail).toContain("could not be saved");
  });

  it("refuses an unverified owner", async () => {
    expect((await runPreTripWith(deps(fakeOffice(), { ownerId: "x" }), "daily")).ok).toBe(false);
  });
});

describe("readPreTripForElsie", () => {
  it("tells Elsie today is not checked when there is no record", async () => {
    const text = await readPreTripForElsie(fakeOffice().rest, OWNER, new Date("2026-10-24T15:00:00Z"));
    expect(text).toContain("NOT CHECKED TODAY");
  });
  it("never guesses when the read fails", async () => {
    const text = await readPreTripForElsie(async () => ({ ok: false, status: 500, body: null }), OWNER, new Date());
    expect(text).toContain("Do not guess");
  });
});
