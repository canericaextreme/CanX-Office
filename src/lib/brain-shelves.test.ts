import { describe, it, expect } from "vitest";
import { readBrainIndexWith, type BrainRest } from "./brain-index.server";
import { saveShelfWith } from "./brain-shelves.server";
import {
  SHELF_SOURCE,
  shelfNoteId,
  countByShelf,
  itemShelf,
  shelvesForModel,
} from "./brain-shelves";
import type { BackendConfig } from "./canx-backend.server";
const config = { url: "https://fixture", publishableKey: "pk" } as BackendConfig;
function database() {
  const original = {
    id: "f1",
    filename: "Goals budget history.pdf",
    room: "legal",
    folder: "Start Here",
    created_at: "2026-10-01",
  };
  const notes: Record<string, unknown>[] = [
    { id: "legacy", title: "file:f1", detail: "memory", source: "Brain index: category" },
  ];
  const writes: { path: string; init: RequestInit }[] = [];
  let failLabels = false,
    corruptBack = false,
    conflict = false;
  const rest: BrainRest = async (_c, _t, path, init) => {
    if (init?.method) {
      writes.push({ path, init });
      if (conflict) return { ok: true, status: 200, body: [] };
      const body = JSON.parse(String(init.body));
      const row = Array.isArray(body) ? body[0] : body;
      const existing = notes.findIndex((n) => n["id"] === row.id);
      if (existing >= 0) notes[existing] = row;
      else notes.push(row);
      return { ok: true, status: 201, body: [row] };
    }
    const url = new URL(path, "https://fixture");
    if (url.pathname === "/office_notes") {
      const source = url.searchParams.get("source")?.slice(3);
      if (source === SHELF_SOURCE && failLabels) return { ok: false, status: 500, body: null };
      let rows = notes.filter((n) => !source || n["source"] === source);
      const id = url.searchParams.get("id")?.slice(3);
      if (id) rows = rows.filter((n) => n["id"] === id);
      if (id && corruptBack) rows = rows.map((n) => ({ ...n, detail: "wrong" }));
      return { ok: true, status: 200, body: rows };
    }
    const rows =
      url.pathname === "/office_files"
        ? [original]
        : url.pathname === "/astra_memory"
          ? [{ id: "m1", title: "Office goal", category: "goal", updated_at: "2026-10-01" }]
          : [];
    return { ok: true, status: 200, body: rows };
  };
  const input = { config, token: "owner", aal: "aal2", rest, ownerId: "owner" };
  return {
    original,
    notes,
    writes,
    input,
    rest,
    failLabels: () => {
      failLabels = true;
    },
    corruptBack: () => {
      corruptBack = true;
    },
    conflict: () => {
      conflict = true;
    },
  };
}
describe("eight-shelf storage foundation", () => {
  it("does not infer from titles or convert legacy categories; goals use saved category", async () => {
    const db = database();
    const index = await readBrainIndexWith(db.input);
    const file = index.items.find((i) => i.key === "file:f1")!;
    expect(file.category).toBe("memory");
    expect(itemShelf(file)).toBe("library");
    expect(itemShelf(index.items.find((i) => i.key === "memory:m1")!)).toBe("compass");
    expect(Object.keys(countByShelf(index.items))).toHaveLength(8);
    expect(db.writes).toHaveLength(0);
  });
  it("saves only a separate label, reloads the shelf, preserves originals and earlier labels", async () => {
    const db = database();
    const before = JSON.stringify(db.original);
    await saveShelfWith({
      ...db.input,
      filing: { version: 1, itemKey: "file:f1", shelf: "compass" },
      expected: null,
    });
    const loaded = await readBrainIndexWith(db.input);
    expect(itemShelf(loaded.items.find((i) => i.key === "file:f1")!)).toBe("compass");
    expect(db.notes.find((n) => n["id"] === "legacy")?.["detail"]).toBe("memory");
    expect(JSON.stringify(db.original)).toBe(before);
    expect(db.writes.every((w) => w.path.startsWith("office_notes"))).toBe(true);
    const raw = String(db.notes.find((n) => n["id"] === shelfNoteId("file:f1"))?.["detail"]);
    await saveShelfWith({
      ...db.input,
      filing: { version: 1, itemKey: "file:f1", shelf: "logbook" },
      expected: raw,
    });
    expect(db.writes[1]!.init.method).toBe("PATCH");
    expect(db.writes[1]!.path).toContain("detail=eq.");
  });
  it("refuses missing item, stale version, concurrent save and failed readback", async () => {
    const filing = { version: 1 as const, itemKey: "file:f1", shelf: "compass" as const };
    const absent = database();
    await expect(
      saveShelfWith({
        ...absent.input,
        filing: { ...filing, itemKey: "file:absent" },
        expected: null,
      }),
    ).rejects.toThrow("could not be read");
    expect(absent.writes).toHaveLength(0);
    const stale = database();
    await expect(saveShelfWith({ ...stale.input, filing, expected: "stale" })).rejects.toThrow(
      "changed elsewhere",
    );
    expect(stale.writes).toHaveLength(0);
    const raced = database();
    raced.conflict();
    await expect(saveShelfWith({ ...raced.input, filing, expected: null })).rejects.toThrow(
      "changed elsewhere",
    );
    const bad = database();
    bad.corruptBack();
    await expect(saveShelfWith({ ...bad.input, filing, expected: null })).rejects.toThrow(
      "confirmed on re-read",
    );
  });
  it("does not write or describe guessed counts when shelf labels cannot be read", async () => {
    const db = database();
    db.failLabels();
    const index = await readBrainIndexWith(db.input);
    expect(index.sources.find((s) => s.key === "shelves")?.status).toBe("failed");
    expect(shelvesForModel(index).join("\n")).toContain("count unknown");
    await expect(
      saveShelfWith({
        ...db.input,
        filing: { version: 1, itemKey: "file:f1", shelf: "compass" },
        expected: null,
      }),
    ).rejects.toThrow("could not be read");
    expect(db.writes).toHaveLength(0);
  });
  it("keeps two-step boundary for shelf labels and memory", async () => {
    const db = database();
    const index = await readBrainIndexWith({ ...db.input, aal: "aal1" });
    expect(index.sources.find((s) => s.key === "shelves")?.status).toBe("denied");
    expect(index.sources.find((s) => s.key === "memory")?.status).toBe("denied");
    await expect(
      saveShelfWith({
        ...db.input,
        aal: "aal1",
        filing: { version: 1, itemKey: "file:f1", shelf: "library" },
        expected: null,
      }),
    ).rejects.toThrow("Two-step");
    expect(db.writes).toHaveLength(0);
  });
});

import {
  BRAIN_SHELVES,
  SHELF_COLORS,
  SHELF_DISPLAY,
  BRAIN_CAST,
  shelfSynopsis,
} from "./brain-shelves";
import type { BrainItem } from "./brain-index";

describe("agreed shelf display design (PR70 + brain map)", () => {
  it("has all eight shelves with the agreed names, colour names and colours", () => {
    expect(BRAIN_SHELVES.map((s) => SHELF_DISPLAY[s].name)).toEqual([
      "The Compass", "The Rulebook", "The Workshop", "The Piggy Bank",
      "The Library", "The Diary", "The Logbook", "The Lost-and-Found",
    ]);
    expect(BRAIN_SHELVES.map((s) => SHELF_DISPLAY[s].colourName)).toEqual([
      "Yellow", "Red", "Green", "Orange", "Blue", "Purple", "Light grey", "Dark grey",
    ]);
    expect(BRAIN_SHELVES.map((s) => SHELF_COLORS[s])).toEqual([
      "#FACC15", "#B91C1C", "#15803D", "#F97316", "#1D4ED8", "#7E22CE", "#D1D5DB", "#374151",
    ]);
  });
  it("names the cast as in the saved map", () => {
    expect(BRAIN_CAST.map((c) => `${c.who}: ${c.role}`)).toEqual([
      "Elsie: Front-Desk Manager", "ChatGPT: the Drafter", "Claude: the Second Pair of Eyes",
      "Brain: the Memory Keeper", "Codex and Claude builders: the Workshop Crew",
    ]);
  });
});

describe("hover synopsis comes only from live records", () => {
  const mk = (key: string, kind: BrainItem["kind"], at: string | null, shelf?: BrainItem["shelf"]) =>
    ({ key, kind, title: `T ${key}`, room: null, folder: null, at, provenance: "x", version: null,
      access: "metadata only", defaultCategory: "unsorted", category: "unsorted", manual: false,
      route: null, shelf }) as unknown as BrainItem;
  it("describes intended use and confirmed indexed subjects, keeping counts secondary", () => {
    const items = [
      mk("file:1", "file", "2026-10-01T00:00:00Z", "library"),
      mk("file:2", "file", "2026-10-03T00:00:00Z", "library"),
      mk("doc:1", "doc", null, "library"),
      mk("file:3", "file", "2026-10-09T00:00:00Z", "diary"),
    ];
    const text = shelfSynopsis(items, "library", true);
    expect(text).toContain("3 indexed items");
    expect(text).toMatch(/^On this shelf you will find/);
    expect(text).toContain("intended for documents, original files");
    expect(text).not.toContain("Newest saved");
    expect(text).toContain("T file:1");
    expect(text).not.toContain("T file:3");
  });
  it("says nothing is filed when empty, and unknown when shelf labels are unreadable", () => {
    expect(shelfSynopsis([], "diary", true)).toContain("Nothing is filed here yet in the readable index.");
    const unread = shelfSynopsis([mk("file:1", "file", null, "diary")], "diary", false);
    expect(unread).toContain("count is unknown");
    expect(unread).not.toMatch(/\d+ items?/);
  });
});

describe("Elsie receives the same authoritative shelf definitions", () => {
  it("lists every shelf with its number, agreed name, colour and the cast", () => {
    const idx = { checkedAt: "2026-10-03T22:00:00Z", items: [], sources: [], orphanLabels: 0 } as unknown as Parameters<typeof shelvesForModel>[0];
    const text = shelvesForModel(idx).join("\n");
    BRAIN_SHELVES.forEach((s, n) => {
      expect(text).toContain(`Shelf ${n + 1}, ${SHELF_DISPLAY[s].name} (${SHELF_DISPLAY[s].colourName}, ${SHELF_COLORS[s]})`);
    });
    expect(text).toContain("Elsie is Front-Desk Manager");
    expect(text).toContain("Claude is the Second Pair of Eyes");
  });
});


it("gives every shelf its intended purpose without claiming unavailable contents", () => {
  for (const shelf of BRAIN_SHELVES) {
    const text = shelfSynopsis([], shelf, false);
    expect(text).toMatch(/^On this shelf you will find\.\.\. This shelf is intended for/);
    expect(text).toContain("contents are unknown");
    expect(text).not.toContain("Currently indexed");
  }
  expect(shelfSynopsis([], "rulebook", true)).toContain("working instructions, agreed rules and saved guidance used by the Office team");
});

it("discloses partial coverage and excludes unreadable record metadata", () => {
  const hidden = { kind: "file", shelf: "library", title: "Unavailable title", shelfReadable: false } as BrainItem;
  const text = shelfSynopsis([hidden], "library", true, true);
  expect(text).not.toContain("Unavailable title");
  expect(text).toContain("Some sources are unavailable or limited");
});
