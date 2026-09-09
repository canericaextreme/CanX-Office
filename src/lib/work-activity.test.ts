import { describe, expect, it } from "vitest";
import {
  animatingCellIds,
  animatingEvents,
  canAnimate,
  describeState,
  DISCONNECTED_FEED,
  isStale,
  loadWorkFeed,
  type WorkEvent,
  type WorkFeed,
} from "./work-activity";

const NOW = Date.parse("2026-09-09T18:00:00.000Z");

function event(overrides: Partial<WorkEvent> = {}): WorkEvent {
  return {
    taskId: "task-1",
    jobId: "job-1",
    title: "Nightly records export",
    source: "CanX database",
    state: "running",
    lastHeartbeat: new Date(NOW - 5_000).toISOString(),
    cellId: "room-records",
    workerId: "worker-systems",
    projectId: "project-office",
    ...overrides,
  };
}

function feed(events: WorkEvent[], connected = true): WorkFeed {
  return { connected, status: "Connected", source: "CanX database", checkedAt: new Date(NOW).toISOString(), events };
}

const opts = { reducedMotion: false, now: NOW };

describe("brain movement gate", () => {
  it("has no animation when there are no events", () => {
    expect(animatingEvents(DISCONNECTED_FEED, opts)).toEqual([]);
    expect(animatingCellIds(DISCONNECTED_FEED, opts).size).toBe(0);
  });

  it("never animates when the feed is disconnected, even with a running event", () => {
    const f = feed([event()], false);
    expect(animatingEvents(f, opts)).toEqual([]);
  });

  it("never animates sample events", () => {
    const f = feed([event({ sample: true })]);
    expect(canAnimate(f, event({ sample: true }), opts)).toBe(false);
    expect(animatingEvents(f, opts)).toEqual([]);
  });

  it("allows a fresh running event", () => {
    const f = feed([event()]);
    expect(animatingEvents(f, opts)).toHaveLength(1);
    expect(animatingCellIds(f, opts).has("room-records")).toBe(true);
  });

  it("stops a stale running event", () => {
    const stale = event({ lastHeartbeat: new Date(NOW - 10 * 60_000).toISOString() });
    expect(isStale(stale, NOW)).toBe(true);
    expect(animatingEvents(feed([stale]), opts)).toEqual([]);
    expect(describeState(stale, NOW)).toContain("quiet");
  });

  it.each(["queued", "idle", "completed", "failed", "cancelled"] as const)("stops %s work", (state) => {
    expect(animatingEvents(feed([event({ state })]), opts)).toEqual([]);
  });

  it("disables all movement under reduced motion", () => {
    const f = feed([event()]);
    expect(animatingEvents(f, { reducedMotion: true, now: NOW })).toEqual([]);
    expect(animatingCellIds(f, { reducedMotion: true, now: NOW }).size).toBe(0);
  });

  it("rejects an unreadable heartbeat", () => {
    expect(animatingEvents(feed([event({ lastHeartbeat: "not-a-date" })]), opts)).toEqual([]);
  });

  it("reports disconnected until a real feed exists", () => {
    const loaded = loadWorkFeed();
    expect(loaded.connected).toBe(false);
    expect(loaded.events).toEqual([]);
    expect(loaded.status).toBe("No live work connected");
  });
});
