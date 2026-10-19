import { describe, expect, it } from "vitest";
import {
  buildWorkBoard, effectiveStage, isRecordableChange, normalizeStage, parseWorkEvent,
  stageTotals, workBoardForModel, STAGE_COLOURS, STALL_AFTER_MS, WORK_STAGES,
} from "./work-board";

const now = new Date("2026-10-19T12:00:00Z");
const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  id, subjectKind: "task", subjectId: "t1", fromRoom: "/brain", toRoom: "/projects",
  fromStage: "brainstorming", toStage: "building", at: "2026-10-18T12:00:00Z", ...extra,
});

describe("work board stages", () => {
  it("has exactly the five owner stages, each with a colour", () => {
    expect([...WORK_STAGES]).toEqual(["brainstorming", "strategizing", "building", "stalled", "completed"]);
    for (const st of WORK_STAGES) expect(STAGE_COLOURS[st]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("maps planned to strategizing and blocked to stalled; unknown is never guessed", () => {
    expect(normalizeStage("planned")).toBe("strategizing");
    expect(normalizeStage(" Blocked ")).toBe("stalled");
    expect(normalizeStage("done")).toBe("completed");
    expect(normalizeStage("wibble")).toBeNull();
    expect(normalizeStage(3)).toBeNull();
  });

  it("stalls after 7 days with no event, but never stalls completed work", () => {
    const at = new Date(now.getTime() - STALL_AFTER_MS).toISOString();
    const recent = new Date(now.getTime() - STALL_AFTER_MS + 1000).toISOString();
    expect(effectiveStage("building", at, now)).toBe("stalled");
    expect(effectiveStage("building", recent, now)).toBe("building");
    expect(effectiveStage("completed", at, now)).toBe("completed");
    expect(effectiveStage("strategizing", null, now)).toBe("stalled");
  });

  it("records only room or stage changes", () => {
    expect(isRecordableChange({ room: "/brain", stage: "building" }, { room: "/brain", stage: "building" })).toBe(false);
    expect(isRecordableChange({ room: "/brain", stage: "building" }, { room: "/projects", stage: "building" })).toBe(true);
    expect(isRecordableChange({ room: null, stage: null }, { room: "/brain", stage: "brainstorming" })).toBe(true);
  });
});

describe("work board model", () => {
  it("rejects malformed events instead of repairing them", () => {
    expect(parseWorkEvent(ev("a"))).not.toBeNull();
    expect(parseWorkEvent(ev("b", { subjectKind: "person" }))).toBeNull();
    expect(parseWorkEvent(ev("c", { toStage: "maybe" }))).toBeNull();
    expect(parseWorkEvent(ev("d", { at: "not a date" }))).toBeNull();
    expect(parseWorkEvent(ev("e", { toRoom: "https://evil" }))).toBeNull();
  });

  it("builds one node per room and one spark per room move", () => {
    const rows = [
      ev("1", { fromRoom: null, toRoom: "/brain", fromStage: null, toStage: "brainstorming", at: "2026-10-17T00:00:00Z" }),
      ev("2", { at: "2026-10-18T00:00:00Z" }),
      ev("2", { at: "2026-10-18T00:00:00Z" }), // duplicate id counted once
      ev("3", { subjectKind: "office-build", subjectId: "b1", fromRoom: "/projects", toRoom: "/projects", fromStage: "planned", toStage: "blocked" }),
      { id: "bad" },
    ];
    const board = buildWorkBoard(rows, ["/brain", "/projects", "/analytics"], now, "live");
    expect(board.nodes.map((n) => n.room)).toEqual(["/brain", "/projects", "/analytics"]);
    expect(board.sparks).toHaveLength(1);
    expect(board.sparks[0]).toMatchObject({ fromRoom: "/brain", toRoom: "/projects", toStage: "building" });
    expect(board.invalidEvents).toBe(1);
    const projects = board.nodes.find((n) => n.room === "/projects")!;
    expect(projects.total).toBe(2);
    expect(projects.byStage.building).toBe(1);
    expect(projects.byStage.stalled).toBe(1);
    expect(board.nodes.find((n) => n.room === "/brain")!.total).toBe(0);
    expect(stageTotals(board)).toMatchObject({ building: 1, stalled: 1 });
    expect(workBoardForModel(board)).toContain("2 items, 1 room moves");
  });

  it("is honest when no event store is connected", () => {
    const board = buildWorkBoard([ev("1")], ["/brain"], now, "unavailable");
    expect(board.source).toBe("unavailable");
    expect(board.sparks).toHaveLength(0);
    expect(board.nodes[0]?.total).toBe(0);
    expect(workBoardForModel(board)).toContain("NOT CONNECTED");
  });
});
