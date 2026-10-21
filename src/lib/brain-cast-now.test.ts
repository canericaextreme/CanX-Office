import { describe, expect, it } from "vitest";
import { castNow } from "./brain-cast-now";
import { BRAIN_CAST } from "./brain-shelves";
import type { BrainTaskInfo, BrainView } from "./brain-view";

const NOW = new Date("2026-10-20T12:00:00Z");
const task = (worker: string, status: string): BrainTaskInfo => ({
  id: `${worker}-${status}-${Math.random()}`,
  title: "t",
  saved: { title: "t", detail: "", project: "" },
  status,
  worker,
  waitingReason: "",
  risk: "green",
  updatedAt: "2026-10-19T00:00:00Z",
});
const view = (over: Partial<BrainView> = {}): BrainView =>
  ({
    source: "live",
    nodes: [],
    sparks: [],
    items: [],
    events: [],
    invalidEvents: 0,
    ...over,
  }) as BrainView;
const cast = (who: string) => BRAIN_CAST.find((c) => c.who === who)!;

describe("the live line on each Who's who card", () => {
  it("counts each person's active Work Board tasks by their team-member name", () => {
    const tasks = [
      task("office manager", "open"),
      task("Office Manager", "waiting"),
      task("claude", "waiting"),
      task("claude", "waiting"),
      task("chatgpt", "in_progress"),
      task("systems & security", "open"),
    ];
    expect(castNow(cast("Elsie"), tasks, view(), NOW)).toBe(
      "1 not started, 1 on hold on the Work Board.",
    );
    expect(castNow(cast("Claude"), tasks, view(), NOW)).toBe("2 on hold on the Work Board.");
    expect(castNow(cast("ChatGPT"), tasks, view(), NOW)).toBe("1 in progress on the Work Board.");
    expect(castNow(cast("ChatGPT"), [], view(), NOW)).toBe("Nothing assigned on the Work Board.");
  });

  it("says nothing rather than guessing when the Work Board couldn't be read", () => {
    expect(castNow(cast("Elsie"), null, view(), NOW)).toBeNull();
  });

  it("gives the Brain's logbook size and its latest move", () => {
    const e = (at: string) => ({
      id: at,
      subjectKind: "task" as const,
      subjectId: "x",
      fromRoom: null,
      toRoom: "/reception",
      fromStage: null,
      toStage: "building" as const,
      source: "s",
      at,
    });
    expect(
      castNow(
        cast("Brain"),
        [],
        view({ events: [e("2026-10-20T11:00:00Z"), e("2026-10-20T11:40:00Z")] }),
        NOW,
      ),
    ).toBe("2 moves in the logbook; last one 20 min ago.");
    expect(castNow(cast("Brain"), [], view(), NOW)).toBe("No moves recorded yet.");
  });

  it("counts open builds in the workshop, naming the stalled ones", () => {
    const item = (stage: string, cancelled = false) => ({
      kind: "office-build" as const,
      id: stage,
      room: "/build-testing",
      stage,
      cancelled,
      lastEventAt: "",
    });
    expect(
      castNow(
        cast("Build workshop"),
        [],
        view({
          items: [item("building"), item("stalled"), item("completed"), item("building", true)],
        } as Partial<BrainView>),
        NOW,
      ),
    ).toBe("2 builds open, 1 stalled.");
    expect(castNow(cast("Build workshop"), [], view(), NOW)).toBe("No builds open.");
  });
});
