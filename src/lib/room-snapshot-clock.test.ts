import { describe, expect, it } from "vitest";
import { readRoomSnapshotWith, type SnapshotRest } from "./room-snapshot.server";
import { ROOM_TARGETS } from "./room-snapshot";

const config = { url: "https://db.test", publishableKey: "pk" };
const TOKEN = `x.${btoa(JSON.stringify({ sub: "owner-1" }))}.y`;
// The same saved records every time: one logbook line and one Work Board task.
const rest: SnapshotRest = async (_c, _t, path) => ({
  ok: true,
  status: 200,
  body: path.startsWith("office_work_events")
    ? [
        {
          id: "1",
          subject_kind: "task",
          subject_id: "a",
          from_room: null,
          to_room: "/reception",
          from_stage: null,
          to_stage: "building",
          source: "s",
          occurred_at: "2026-10-18T00:00:00Z",
        },
      ]
    : path.startsWith("manager_tasks")
      ? [
          {
            id: "a",
            title: "Plan",
            detail: "",
            project: "",
            status: "in_progress",
            worker: "projects lead",
            waiting_reason: "",
            risk: "green",
            updated_at: "2026-10-18T00:00:00Z",
            created_at: "2026-10-18T00:00:00Z",
          },
        ]
      : [],
});

describe("room readings compare records, not the clock", () => {
  // John's screen and Elsie read the same room a minute or two apart. If nothing
  // was saved in between, the two readings must match; otherwise Elsie wrongly
  // says she "read newer room data than your screen showed".
  it("gives every room the same fingerprint when only the time has moved", async () => {
    const changed: string[] = [];
    for (const target of ROOM_TARGETS) {
      const at = (iso: string) =>
        readRoomSnapshotWith({
          config,
          token: TOKEN,
          aal: "aal2",
          target,
          rest,
          github: null,
          now: () => new Date(iso),
        } as Parameters<typeof readRoomSnapshotWith>[0]);
      const [a, b] = [await at("2026-10-20T02:00:00Z"), await at("2026-10-20T02:01:30Z")];
      if (a.fingerprint !== b.fingerprint) changed.push(target.route);
    }
    expect(changed).toEqual([]);
  });
});
