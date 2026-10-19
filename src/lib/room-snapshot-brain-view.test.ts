import { describe, expect, it } from "vitest";
import { readRoomSnapshotWith, type SnapshotRest } from "./room-snapshot.server";
import { roomTargetForRoute } from "./room-snapshot";

const config = { url: "https://db.test", publishableKey: "pk" };
const TOKEN = `x.${btoa(JSON.stringify({ sub: "owner-1" }))}.y`;
const NOW = () => new Date("2026-10-19T04:00:00Z");

function fakeRest(events: unknown[] | "fail") {
  const calls: string[] = [];
  const rest: SnapshotRest = async (_c, _t, path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path.startsWith("office_work_events"))
      return events === "fail"
        ? { ok: false, status: 500, body: null }
        : { ok: true, status: 200, body: events };
    return { ok: true, status: 200, body: [] };
  };
  return { rest, calls };
}

const target = () => {
  const t = roomTargetForRoute("/brain");
  if (!t) throw new Error("no Brain target");
  return { ...t, sources: t.sources.filter((s) => s.key === "brain-view") };
};

describe("Elsie's live Brain view source", () => {
  it("is one of the Brain room's live sources", () => {
    expect(
      roomTargetForRoute("/brain")?.sources.some(
        (s) => s.key === "brain-view" && s.kind === "live",
      ),
    ).toBe(true);
  });

  it("reads the logbook read-only and gives Elsie active rooms and moves", async () => {
    const { rest, calls } = fakeRest([
      {
        id: "2",
        subject_kind: "task",
        subject_id: "a",
        from_room: "/idea-garage",
        to_room: "/projects",
        from_stage: "brainstorming",
        to_stage: "building",
        source: "work-board",
        occurred_at: "2026-10-19T03:00:00Z",
      },
      {
        id: "1",
        subject_kind: "task",
        subject_id: "a",
        from_room: null,
        to_room: "/idea-garage",
        from_stage: null,
        to_stage: "brainstorming",
        source: "work-board",
        occurred_at: "2026-10-19T01:00:00Z",
      },
    ]);
    const snap = await readRoomSnapshotWith({
      config,
      token: TOKEN,
      aal: "aal2",
      target: target(),
      rest,
      now: NOW,
    });
    const src = snap.sources.find((s) => s.key === "brain-view")!;
    expect(calls.every((c) => c.startsWith("GET office_work_events"))).toBe(true);
    expect(src.status).toBe("read");
    expect(src.items.join("\n")).toContain("/projects: 1 active");
    expect(src.items.join("\n")).toContain("task /idea-garage → /projects (building)");
    expect(src.detail).toContain("1 room move");
  });

  it("reports a failed read instead of 'no work'", async () => {
    const snap = await readRoomSnapshotWith({
      config,
      token: TOKEN,
      aal: "aal2",
      target: target(),
      rest: fakeRest("fail").rest,
      now: NOW,
    });
    expect(snap.sources.find((s) => s.key === "brain-view")!.status).toBe("failed");
  });

  it("never shows a read-only viewer an empty logbook as if nothing was happening", async () => {
    const { rest, calls } = fakeRest([]);
    const snap = await readRoomSnapshotWith({
      config,
      token: TOKEN,
      aal: "viewer",
      target: target(),
      rest,
      now: NOW,
    });
    expect(snap.sources.find((s) => s.key === "brain-view")!.status).toBe("denied");
    expect(calls).toHaveLength(0);
  });
});
