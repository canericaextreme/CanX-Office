import { describe, expect, it } from "vitest";
import { activityStage, networkSnapshot, networkNarration } from "./office-network";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import type { ActivityRecord } from "./office-activity-log";
const now = Date.parse("2026-10-18T12:00:00Z");
const record: ActivityRecord = {
  taskId: "a",
  title: "Actual work",
  startedAt: new Date(now).toISOString(),
  lastHeartbeat: new Date(now).toISOString(),
  state: "running",
  roomId: "systems",
  stage: "building",
};
describe("whole-office device network", () => {
  it("shows every canonical room once, with no invented activity", () => {
    const board = networkSnapshot([], now);
    expect(board.rooms.map((r) => r.id)).toEqual(OFFICE_ROOM_IDENTITIES.map((r) => r.id));
    expect(board.rooms.every((r) => r.stage === "unknown")).toBe(true);
    expect(board.transfers).toEqual([]);
  });
  it("maps explicit evidence only, not legacy cell ids or job titles", () => {
    const board = networkSnapshot([{ ...record, roomId: "not-a-room", cellId: "systems" }], now);
    expect(board.unmapped).toBe(1);
    expect(board.rooms.every((r) => r.tasks === 0)).toBe(true);
  });
  it("stops activity on stale, future, invalid, failed and completed records", () => {
    expect(activityStage(record, now)).toBe("building");
    expect(activityStage(record, now + 90_001)).toBe("stalled");
    expect(activityStage(record, now - 1)).toBe("stalled");
    expect(activityStage({ ...record, lastHeartbeat: "bad" }, now)).toBe("stalled");
    expect(activityStage({ ...record, state: "failed" }, now)).toBe("stalled");
    expect(activityStage({ ...record, state: "completed" }, now)).toBe("completed");
  });
  it("uses actual handoffs, ignores invalid endpoints, and never replays old or completed work", () => {
    const r = {
      ...record,
      handoffs: [
        { from: "brain", to: "systems", at: record.lastHeartbeat },
        { from: "fake", to: "systems", at: record.lastHeartbeat },
      ],
    };
    expect(networkSnapshot([r], now).transfers).toHaveLength(1);
    expect(networkSnapshot([r], now).transfers[0]?.active).toBe(true);
    expect(networkSnapshot([r], now + 2401).transfers[0]?.active).toBe(false);
    expect(networkSnapshot([{ ...r, state: "completed" }], now).transfers[0]?.active).toBe(false);
  });
  it("counts rooms rather than tasks and gives Elsie the same evidence limits", () => {
    const board = networkSnapshot([record, { ...record, taskId: "b" }], now);
    expect(board.counts.find((c) => c.stage === "building")?.count).toBe(1);
    expect(networkNarration(board)).toContain("not whole-office live verification");
    expect(networkNarration(board)).not.toContain("Actual work");
  });
});
