import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUT,
  addHistory,
  applyChange,
  boxSlug,
  boxesMovedInto,
  isBoxId,
  orderChange,
  parseLayout,
  placeBefore,
  reorder,
  serializeLayout,
  type LayoutHistory,
} from "./room-layout";
import { homeRouteOf, readRoomLayout, saveRoomLayoutWith } from "./room-layout.server";

const ROUTES = ["/finance", "/owner-desk", "/brain"];

describe("room layout rules", () => {
  it("accepts only room.part ids", () => {
    expect(isBoxId("owner-desk.priorities")).toBe(true);
    expect(isBoxId("owner-desk")).toBe(false);
    expect(isBoxId("Owner.desk")).toBe(false);
    expect(isBoxId("a.b;drop")).toBe(false);
  });

  it("drops malformed saved values and unknown rooms instead of losing a box", () => {
    const layout = parseLayout(
      JSON.stringify({
        v: 1,
        b: {
          "owner-desk.budget": { r: "/nowhere", n: "  My  money ", o: 20 },
          "bad id": { n: "x" },
        },
      }),
      ROUTES,
    );
    expect(layout.b).toEqual({ "owner-desk.budget": { n: "My money", o: 20 } });
    expect(parseLayout("not json", ROUTES)).toEqual(EMPTY_LAYOUT);
  });

  it("removes an override that matches the built layout, so moving home leaves no trace but history", () => {
    const homes = { "owner-desk.budget": "/owner-desk" };
    const moved = applyChange(EMPTY_LAYOUT, { "owner-desk.budget": { r: "/finance" } }, homes);
    expect(moved.b["owner-desk.budget"]).toEqual({ r: "/finance" });
    const back = applyChange(moved, { "owner-desk.budget": { r: "/owner-desk" } }, homes);
    expect(back.b).toEqual({});
    expect(applyChange(moved, { "owner-desk.budget": null }, homes).b).toEqual({});
  });

  it("reorders and places boxes", () => {
    expect(reorder(["a.x", "a.y", "a.z"], "a.z", -1)).toEqual(["a.x", "a.z", "a.y"]);
    expect(reorder(["a.x", "a.y"], "a.x", -1)).toBeNull();
    expect(placeBefore(["a.x", "a.y", "a.z"], "a.z", "a.x")).toEqual(["a.z", "a.x", "a.y"]);
    expect(orderChange({ v: 1, b: { "a.y": { n: "Why" } } }, ["a.y", "a.x"])).toEqual({
      "a.y": { n: "Why", o: 10 },
      "a.x": { o: 20 },
    });
  });

  it("lists boxes moved into a room in saved order", () => {
    const layout = {
      v: 1 as const,
      b: {
        "brain.hub": { r: "/finance", o: 20 },
        "owner-desk.budget": { r: "/finance", o: 10 },
        "finance.tax": { o: 5 },
      },
    };
    const homes = {
      "brain.hub": "/brain",
      "owner-desk.budget": "/owner-desk",
      "finance.tax": "/finance",
    };
    expect(boxesMovedInto(layout, "/finance", homes)).toEqual(["owner-desk.budget", "brain.hub"]);
  });

  it("keeps the history note under the size limit by dropping the oldest entries", () => {
    let h: LayoutHistory = { v: 1, h: [] };
    for (let i = 0; i < 400; i++)
      h = addHistory(h, {
        at: new Date(i * 1000).toISOString(),
        what: `Change ${i}`,
        before: { "a.b": null },
        after: { "a.b": { n: `Name ${i}` } },
      });
    expect(JSON.stringify(h).length).toBeLessThanOrEqual(11_000);
    expect(h.h[0]!.what).toBe("Change 399");
  });

  it("makes stable id parts", () => {
    expect(boxSlug("Today's priorities")).toBe("today-s-priorities");
    expect(boxSlug("!!!")).toBe("part");
  });

  it("knows each box's home room from its id", () => {
    expect(homeRouteOf("owner-desk.priorities")).toBe("/owner-desk");
    expect(homeRouteOf("project-rooms.register")).toBe("/projects");
    expect(homeRouteOf("nowhere.part")).toBeNull();
  });
});

/** A tiny in-memory office_notes table that understands the requests the layout makes. */
function fakeNotes() {
  const rows = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const rest = async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    const idEq = q.get("id")?.replace(/^eq\./, "");
    if (!init?.method || init.method === "GET") {
      const row = idEq ? rows.get(idEq) : undefined;
      return { ok: true, status: 200, body: row ? [row] : [] };
    }
    if (init.method === "POST" && path.startsWith("office_notes")) {
      const [row] = JSON.parse(String(init.body)) as Record<string, unknown>[];
      if (rows.has(String(row!["id"]))) return { ok: false, status: 409, body: null };
      rows.set(String(row!["id"]), row!);
      return { ok: true, status: 201, body: [row] };
    }
    if (init.method === "PATCH") {
      const row = idEq ? rows.get(idEq) : undefined;
      const want = q.get("detail");
      if (!row || (want !== null && `eq.${row["detail"]}` !== want))
        return { ok: true, status: 200, body: [] };
      Object.assign(row, JSON.parse(String(init.body)));
      return { ok: true, status: 200, body: [row] };
    }
    return { ok: true, status: 201, body: null };
  };
  return { rows, rest, calls };
}

describe("saving the layout", () => {
  it("saves a move with its history, reads it back and never deletes", async () => {
    const db = fakeNotes();
    const first = await readRoomLayout(db.rest);
    expect(first?.version).toBe("");
    const saved = await saveRoomLayoutWith(db.rest, {
      ownerId: "owner",
      what: 'Moved "AI budget" to Finance',
      after: { "owner-desk.budget": { r: "/finance", o: 9000 } },
      expectedVersion: "",
    });
    expect(saved.ok).toBe(true);
    expect(saved.read?.layout.b["owner-desk.budget"]).toEqual({ r: "/finance", o: 9000 });
    expect(saved.read?.history.h[0]?.before).toEqual({ "owner-desk.budget": null });
    expect(db.rows.get("office-room-layout")?.["source"]).toBe("Office room layout");
    expect(db.calls.some((c) => c.startsWith("DELETE"))).toBe(false);

    // Put it back using the history entry.
    const undo = await saveRoomLayoutWith(db.rest, {
      ownerId: "owner",
      what: "Put back",
      after: saved.read!.history.h[0]!.before,
      expectedVersion: saved.read!.version,
    });
    expect(undo.ok).toBe(true);
    expect(undo.read?.layout.b).toEqual({});
    expect(undo.read?.history.h).toHaveLength(2);
  });

  it("refuses a stale editor instead of overwriting someone else's change", async () => {
    const db = fakeNotes();
    await saveRoomLayoutWith(db.rest, {
      ownerId: "owner",
      what: "One",
      after: { "brain.hub": { n: "Shelves" } },
      expectedVersion: "",
    });
    const stale = await saveRoomLayoutWith(db.rest, {
      ownerId: "owner",
      what: "Two",
      after: { "brain.hub": { n: "Other" } },
      expectedVersion: "",
    });
    expect(stale.ok).toBe(false);
    expect(stale.read?.layout.b["brain.hub"]).toEqual({ n: "Shelves" });
  });

  it("rejects unknown boxes and rooms", async () => {
    const db = fakeNotes();
    expect(
      (
        await saveRoomLayoutWith(db.rest, {
          ownerId: "o",
          what: "x",
          after: { "nowhere.part": { n: "x" } },
          expectedVersion: "",
        })
      ).ok,
    ).toBe(false);
    const r = await saveRoomLayoutWith(db.rest, {
      ownerId: "o",
      what: "x",
      after: { "brain.hub": { r: "/evil" } },
      expectedVersion: "",
    });
    expect(r.ok).toBe(false);
    expect(db.rows.size).toBe(0);
  });

  it("will not treat a note from another source as the layout", async () => {
    const db = fakeNotes();
    db.rows.set("office-room-layout", {
      id: "office-room-layout",
      source: "Something else",
      detail: serializeLayout({ v: 1, b: {} }),
    });
    expect(await readRoomLayout(db.rest)).toBeNull();
  });
});
