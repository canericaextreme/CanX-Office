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
