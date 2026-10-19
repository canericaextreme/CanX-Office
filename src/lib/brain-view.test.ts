import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAIN_STAGES,
  STAGE_COLOURS,
  STAGE_DISPLAY_ORDER,
  STALL_AFTER_MS,
  approvalInfoFromRow,
  brainContextForModel,
  brainViewForModel,
  needsYou,
  taskInfoFromRow,
  buildBrainView,
  effectiveStage,
  movesPerDay,
  normalizeStage,
  parseBrainEvent,
  recentSparks,
  stageTotals,
} from "./brain-view";
import { BRAIN_VIEW_ROUTES, brainViewRooms } from "./brain-view-layout";
import { DEFAULT_TEAM } from "./office-team";

const NOW = new Date("2026-10-19T04:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
let n = 0;
const ev = (o: Partial<Record<string, unknown>>) => ({
  id: `e${++n}`,
  subject_kind: "task",
  subject_id: "t1",
  from_room: null,
  to_room: "/work-board",
  from_stage: null,
  to_stage: "strategizing",
  source: "work-board",
  occurred_at: hoursAgo(1),
  ...o,
});

describe("stages", () => {
  it("maps old plan words and task words, and never guesses", () => {
    expect(normalizeStage("planned")).toBe("strategizing");
    expect(normalizeStage("testing")).toBe("building");
    expect(normalizeStage("blocked")).toBe("stalled");
    expect(normalizeStage("waiting")).toBe("stalled");
    expect(normalizeStage("ready")).toBe("completed");
    expect(normalizeStage("market")).toBe("completed");
    expect(normalizeStage("unknown")).toBeNull();
    expect(normalizeStage(42)).toBeNull();
  });
  it("marks work stalled after 7 days with no change, but never completed work", () => {
    expect(
      effectiveStage(
        "building",
        new Date(NOW.getTime() - STALL_AFTER_MS + 1000).toISOString(),
        NOW,
      ),
    ).toBe("building");
    expect(
      effectiveStage("building", new Date(NOW.getTime() - STALL_AFTER_MS).toISOString(), NOW),
    ).toBe("stalled");
    expect(effectiveStage("completed", "2020-01-01T00:00:00Z", NOW)).toBe("completed");
    expect(effectiveStage("strategizing", null, NOW)).toBe("stalled");
  });
  it("has one colour per stage and shows every stage in the legend order", () => {
    expect(new Set(Object.values(STAGE_COLOURS)).size).toBe(BRAIN_STAGES.length);
    expect([...STAGE_DISPLAY_ORDER].sort()).toEqual([...BRAIN_STAGES].sort());
  });
});

describe("logbook lines", () => {
  it("accepts a real line and rejects bad ones without repairing them", () => {
    expect(parseBrainEvent(ev({}))?.toRoom).toBe("/work-board");
    expect(parseBrainEvent(ev({ subject_kind: "person" }))).toBeNull();
    expect(parseBrainEvent(ev({ to_room: "reception" }))).toBeNull();
    expect(parseBrainEvent(ev({ to_stage: "planned-ish" }))).toBeNull();
    expect(parseBrainEvent(ev({ occurred_at: "not a date" }))).toBeNull();
  });
});

describe("the view", () => {
  it("gives every Office room a node even with no work", () => {
    const v = buildBrainView([], BRAIN_VIEW_ROUTES, NOW, "live");
    expect(v.nodes.map((x) => x.room)).toEqual(BRAIN_VIEW_ROUTES);
    expect(v.nodes.every((x) => x.total === 0)).toBe(true);
  });

  it("follows each item to its latest room and makes one spark per room move", () => {
    const rows = [
      ev({
        subject_id: "idea",
        to_room: "/idea-garage",
        to_stage: "brainstorming",
        occurred_at: hoursAgo(5),
      }),
      ev({
        subject_id: "idea",
        from_room: "/idea-garage",
        to_room: "/projects",
        from_stage: "brainstorming",
        to_stage: "building",
        occurred_at: hoursAgo(2),
      }),
      ev({
        subject_id: "idea",
        from_room: "/projects",
        to_room: "/projects",
        from_stage: "building",
        to_stage: "stalled",
        occurred_at: hoursAgo(1),
      }),
    ];
    const v = buildBrainView(rows, BRAIN_VIEW_ROUTES, NOW, "live");
    expect(v.sparks).toHaveLength(1);
    expect(v.sparks[0]).toMatchObject({
      fromRoom: "/idea-garage",
      toRoom: "/projects",
      toStage: "building",
    });
    const projects = v.nodes.find((x) => x.room === "/projects")!;
    expect(projects).toMatchObject({ total: 1, active: 1 });
    expect(projects.byStage.stalled).toBe(1);
    expect(v.nodes.find((x) => x.room === "/idea-garage")!.total).toBe(0);
  });

  it("counts duplicate lines once and unreadable lines separately", () => {
    const a = ev({});
    const v = buildBrainView([a, a, { id: "bad" }], BRAIN_VIEW_ROUTES, NOW, "live");
    expect(v.items).toHaveLength(1);
    expect(v.invalidEvents).toBe(1);
  });

  it("treats cancelled work as finished, never active, and reports it apart from completed", () => {
    const v = buildBrainView(
      [
        ev({ subject_id: "x", to_stage: "completed", source: "task-cancelled" }),
        ev({ subject_id: "y", to_stage: "completed" }),
      ],
      BRAIN_VIEW_ROUTES,
      NOW,
      "live",
    );
    expect(v.nodes.find((x) => x.room === "/work-board")!.active).toBe(0);
    const t = stageTotals(v);
    expect(t.completed).toBe(1);
    expect(t.cancelled).toBe(1);
  });

  it("shows nothing and says NOT CONNECTED when the logbook can't be read", () => {
    const v = buildBrainView([ev({})], BRAIN_VIEW_ROUTES, NOW, "unavailable");
    expect(v.items).toHaveLength(0);
    expect(brainViewForModel(v, NOW)).toMatch(/NOT CONNECTED/);
  });

  it("tells Elsie plainly when nothing is recorded, instead of inventing activity", () => {
    expect(brainViewForModel(buildBrainView([], BRAIN_VIEW_ROUTES, NOW, "live"), NOW)).toMatch(
      /no work has been recorded yet/,
    );
  });

  it("gives Elsie active rooms and recent moves", () => {
    const v = buildBrainView(
      [
        ev({
          subject_id: "b",
          subject_kind: "office-build",
          to_room: "/build-testing",
          to_stage: "building",
          occurred_at: hoursAgo(3),
        }),
        ev({
          subject_id: "b",
          subject_kind: "office-build",
          from_room: "/build-testing",
          to_room: "/approvals",
          from_stage: "building",
          to_stage: "stalled",
          occurred_at: hoursAgo(1),
        }),
      ],
      BRAIN_VIEW_ROUTES,
      NOW,
      "live",
    );
    const text = brainViewForModel(v, NOW);
    expect(text).toContain("/approvals: 1 active");
    expect(text).toContain("office-build /build-testing → /approvals (stalled)");
  });
});

describe("charts and replay", () => {
  it("counts changes and room moves per day, and leaves out the starting point", () => {
    const v = buildBrainView(
      [
        ev({ subject_id: "s", source: "starting-point", occurred_at: hoursAgo(2) }),
        ev({ subject_id: "a", occurred_at: hoursAgo(2) }),
        ev({
          subject_id: "a",
          from_room: "/work-board",
          to_room: "/legal",
          occurred_at: hoursAgo(1),
        }),
      ],
      BRAIN_VIEW_ROUTES,
      NOW,
      "live",
    );
    const days = movesPerDay(v, NOW, 14);
    expect(days).toHaveLength(14);
    expect(days.reduce((s, d) => s + d.changes, 0)).toBe(2);
    expect(days.reduce((s, d) => s + d.moves, 0)).toBe(1);
  });
  it("replays only the last day's moves on opening", () => {
    const v = buildBrainView(
      [
        ev({
          subject_id: "old",
          from_room: "/legal",
          to_room: "/finance",
          occurred_at: hoursAgo(30),
        }),
        ev({
          subject_id: "new",
          from_room: "/legal",
          to_room: "/finance",
          occurred_at: hoursAgo(2),
        }),
      ],
      BRAIN_VIEW_ROUTES,
      NOW,
      "live",
    );
    expect(recentSparks(v, NOW).map((s) => s.subjectId)).toEqual(["new"]);
  });
});

describe("layout and the database recorder stay in step", () => {
  it("places all 24 Office rooms once, with the Brain in the middle", () => {
    const rooms = brainViewRooms();
    expect(rooms).toHaveLength(24);
    expect(new Set(rooms.map((r) => r.route)).size).toBe(24);
    expect(rooms.find((r) => r.hub)).toMatchObject({ route: "/brain", x: 0, y: 0 });
    for (const r of rooms) {
      expect(Math.abs(r.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.y)).toBeLessThanOrEqual(1);
    }
  });

  it("uses exactly the rooms the logbook accepts", () => {
    const sql = readFileSync("supabase/migrations/20261019021500_office_work_events.sql", "utf8");
    const list = sql
      .match(/to_room IN \(([^)]*)\)/)![1]!
      .match(/'([^']+)'/g)!
      .map((x) => x.slice(1, -1));
    expect([...list].sort()).toEqual([...BRAIN_VIEW_ROUTES].sort());
  });

  it("files each team member's work in their home room", () => {
    const sql = readFileSync(
      "supabase/migrations/20261019040000_office_work_event_recorder.sql",
      "utf8",
    );
    const routeFor = (roomId: string) => (roomId === "project-rooms" ? "/projects" : `/${roomId}`);
    for (const m of DEFAULT_TEAM) {
      expect(sql).toContain(`WHEN '${m.name.toLowerCase()}' THEN '${routeFor(m.roomId)}'`);
      expect(BRAIN_VIEW_ROUTES).toContain(routeFor(m.roomId));
    }
  });
});

describe("Needs you and names", () => {
  const view = buildBrainView(
    [
      ev({
        subject_id: "w1",
        to_room: "/build-testing",
        to_stage: "stalled",
        occurred_at: hoursAgo(20),
      }),
      ev({
        subject_id: "q1",
        to_room: "/systems",
        to_stage: "strategizing",
        occurred_at: hoursAgo(24 * 9),
      }),
    ],
    BRAIN_VIEW_ROUTES,
    NOW,
    "live",
  );
  const tasks = [
    taskInfoFromRow({
      id: "w1",
      title: "Finance headings",
      detail: "d",
      project: "",
      status: "waiting",
      worker: "claude",
      waiting_reason: "Draft #122 needs review",
      risk: "green",
      updated_at: hoursAgo(20),
    })!,
    taskInfoFromRow({
      id: "q1",
      title: "Rotate keys",
      status: "open",
      worker: "systems & security",
      waiting_reason: "",
      risk: "yellow",
      updated_at: hoursAgo(24 * 9),
    })!,
    taskInfoFromRow({
      id: "f1",
      title: "Fresh task",
      status: "open",
      worker: "office manager",
      waiting_reason: "",
      risk: "green",
      updated_at: hoursAgo(2),
    })!,
  ];
  const approvals = [
    approvalInfoFromRow({
      id: "a1",
      title: "Buy domain",
      detail: "For Trails",
      cost_cents: 1500,
      risk: "yellow",
      created_at: hoursAgo(1),
      task_id: null,
    })!,
  ];

  it("lists approvals first, then holds with their reason, then work quiet for a week", () => {
    const n = needsYou(view, tasks, approvals, NOW);
    expect(n.map((x) => [x.kind, x.id])).toEqual([
      ["approval", "a1"],
      ["waiting", "w1"],
      ["quiet", "q1"],
    ]);
    expect(n[1]).toMatchObject({ room: "/build-testing", why: "On hold: Draft #122 needs review" });
    expect(n[2]!.why).toMatch(/no change for 9 days/);
    expect(n.some((x) => x.id === "f1")).toBe(false);
  });

  it("keeps each task's saved text exactly, for a safe resume", () => {
    expect(tasks[0]!.saved).toEqual({ title: "Finance headings", detail: "d", project: "" });
  });

  it("gives Elsie names and what needs John, quoted as data", () => {
    const text = brainContextForModel(view, NOW, { tasks, approvals });
    expect(text).toContain('/build-testing · stalled · "Finance headings"');
    expect(text).toContain("Needs John (3)");
    expect(text).toContain('[approval] "Buy domain"');
    expect(text).toContain("cost 1500¢");
  });

  it("tells Elsie when names couldn't be read, instead of guessing", () => {
    expect(brainContextForModel(view, NOW, { tasks: null, approvals: null })).toMatch(
      /Work Board could not be read/,
    );
  });
});
