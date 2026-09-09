import { beforeEach, describe, expect, it } from "vitest";
import { finishActivity, listActivity, startActivity, toWorkEvents } from "./office-activity-log";
import { animatingEvents, loadWorkFeed } from "./work-activity";

describe("office activity log", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("records nothing until real work starts", () => {
    expect(listActivity()).toEqual([]);
    const feed = loadWorkFeed();
    expect(feed.connected).toBe(false);
    expect(feed.status).toBe("No live work connected");
    expect(feed.events).toEqual([]);
  });

  it("shows a running record only while the work is actually running", () => {
    startActivity({ taskId: "t1", title: "Claude second eyes — CanX Opportunity Scout", cellId: "systems" });
    const feed = loadWorkFeed();
    expect(feed.connected).toBe(true);
    expect(animatingEvents(feed, { reducedMotion: false })).toHaveLength(1);

    finishActivity("t1", "completed", "Claude returned an independent review.");
    const done = loadWorkFeed();
    expect(done.events[0]?.state).toBe("completed");
    expect(animatingEvents(done, { reducedMotion: false })).toHaveLength(0);
  });

  it("never animates for reduced motion or stale heartbeats", () => {
    startActivity({ taskId: "t2", title: "Claude second eyes", cellId: "systems" });
    const feed = loadWorkFeed();
    expect(animatingEvents(feed, { reducedMotion: true })).toHaveLength(0);
    expect(animatingEvents(feed, { reducedMotion: false, now: Date.now() + 600_000 })).toHaveLength(0);
  });

  it("marks a failed review as failed and still", () => {
    startActivity({ taskId: "t3", title: "Claude second eyes" });
    finishActivity("t3", "failed", "The review did not complete.");
    const feed = loadWorkFeed();
    expect(animatingEvents(feed, { reducedMotion: false })).toHaveLength(0);
    expect(toWorkEvents(listActivity())[0]?.sample).toBeUndefined();
  });
});
