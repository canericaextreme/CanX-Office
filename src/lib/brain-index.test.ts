import { describe, expect, it, vi } from "vitest";
import { readBrainIndexWith, type BrainRest } from "./brain-index.server";
import {
  CATEGORY_NOTE_SOURCE, brainIndexForModel, categoryNoteId, countByCategory, isItemKey, noteDefaultCategory, requestNeedsBrain, searchBrain,
} from "./brain-index";
import { OFFICE_SKILLS } from "./office-skills";
import { readRoomSnapshotWith } from "./room-snapshot.server";
import { roomTargetForRoute } from "./room-snapshot";
import type { BackendConfig } from "./canx-backend.server";

const CONFIG = { url: "https://x", publishableKey: "pk" } as BackendConfig;

/** Fake owner database holding category label rows that can change between reads. */
function db(over: Record<string, unknown[] | "fail"> = {}) {
  const tables: Record<string, unknown[] | "fail"> = {
    office_files: [
      { id: "f1", filename: "Truck lease.pdf", room: "legal", folder: "CanX Projects", content_hash: "a".repeat(64), created_at: "2026-10-01T00:00:00Z" },
      { id: "f2", filename: "Receipt.png", room: "finance", folder: "Finance", content_hash: "b".repeat(64), created_at: "2026-10-02T00:00:00Z" },
      { id: "f3", filename: "Family tree.docx", room: "family-continuity", folder: "Family and Legacy", content_hash: "c".repeat(64), created_at: "2026-09-01T00:00:00Z" },
    ],
    office_links: [{ id: "l1", title: "Highway standard", room: "research", folder: "CanX Projects", created_at: "2026-09-02T00:00:00Z" }],
    knowledge_documents: [{ id: "d1", title: "Trail book", project: "Trail Tales book", filename: "trail.docx", content_hash: "d".repeat(64), character_count: 9000, chunk_count: 3, created_at: "2026-09-03T00:00:00Z" }],
    office_notes: [
      { id: "n1", kind: "decision", title: "Saved chat 3 Oct", source: "CanX Brain: explicitly saved conversation", provenance: "john", created_at: "1" },
      { id: "n2", kind: "decision", title: "Keep budget under C$500", source: "CanX Brain: continuity", provenance: "john", created_at: "2" },
      { id: "n3", kind: "decision", title: "Approve RFP parking", source: "John", provenance: "john", created_at: "3" },
      { id: "n4", kind: "task", title: "Draft email", source: "Office Manager", provenance: "ai-proposal", created_at: "4" },
      { id: "n5", kind: "decision", title: "Old odd import", source: "CanX Brain: legacy thing", provenance: "john", created_at: "5" },
      { id: "n6", kind: "decision", title: "Legal report", source: "Data room report: legal", provenance: "john", created_at: "6" },
    ],
    manager_tasks: [{ id: "t1", title: "Fix lease", project: "Trail Tales book", status: "open", updated_at: "7" }],
    ...over,
  };
  const calls: string[] = [];
  const rest: BrainRest = async (_c, _t, path, init) => {
    calls.push(path);
    const name = path.split("?")[0]!;
    const v = tables[name];
    if (v === "fail") return { ok: false, status: 500, body: null };
    let rows = (v ?? []) as Array<Record<string, unknown>>;
    if (path.includes("room=neq.finance")) rows = rows.filter((r) => r["room"] !== "finance");
    if (init?.method === "POST") return { ok: true, status: 201, body: null };
    return { ok: true, status: 200, body: rows };
  };
  return { rest, tables, calls };
}
const read = (d: ReturnType<typeof db>, aal = "aal2") => readBrainIndexWith({ config: CONFIG, token: "t", aal, rest: d.rest, now: () => new Date("2026-10-03T22:00:00Z") });

describe("default categories follow explicit provenance only", () => {
  it("files and links default to Downloads with original room, folder and name kept", async () => {
    const idx = await read(db());
    const f = idx.items.find((i) => i.key === "file:f3")!;
    expect(f).toMatchObject({ category: "downloads", room: "family-continuity", folder: "Family and Legacy", title: "Family tree.docx", route: "/family-continuity" });
    expect(idx.items.find((i) => i.key === "link:l1")).toMatchObject({ category: "downloads", room: "research", route: "/research" });
  });
  it("discussion vs memory: saved summaries are Discussions, continuity and John's decisions are Memory", async () => {
    const idx = await read(db());
    expect(idx.items.find((i) => i.key === "note:n1")?.category).toBe("discussions");
    expect(idx.items.find((i) => i.key === "note:n2")?.category).toBe("memory");
    expect(idx.items.find((i) => i.key === "note:n3")?.category).toBe("memory");
    expect(idx.items.some((i) => i.key === "note:n4")).toBe(false); // AI proposal task is not Brain memory
    expect(idx.items.some((i) => i.key === "note:n6")).toBe(false); // room report stays in its room
  });
  it("unknown legacy items are kept under Needs a category, never dropped", async () => {
    const idx = await read(db());
    expect(idx.items.find((i) => i.key === "note:n5")?.category).toBe("unsorted");
    expect(noteDefaultCategory("CanX Brain: whatever", "decision", "john")).toBe("unsorted");
  });
  it("Knowledge carries the document version and extraction coverage; Projects link sources; all skills present", async () => {
    const idx = await read(db());
    expect(idx.items.find((i) => i.key === "doc:d1")).toMatchObject({ category: "knowledge" });
    expect(idx.items.find((i) => i.key === "doc:d1")?.version).toMatch(/version dddddddddddd · 3 sections · 9000 characters/);
    expect(idx.items.find((i) => i.kind === "project")).toMatchObject({ title: "Trail Tales book", provenance: "Derived from 1 Work Board task(s) and 1 document(s)" });
    const skills = idx.items.filter((i) => i.kind === "skill");
    expect(skills).toHaveLength(OFFICE_SKILLS.length);
    expect(skills.filter((s) => /outline — not installed/.test(s.version ?? "")).length).toBe(OFFICE_SKILLS.filter((s) => s.kind === "outline").length);
  });
});

describe("permission boundaries", () => {
  it("without two-step: Finance files hidden, notes and labels denied, not shown as empty", async () => {
    const d = db();
    const idx = await read(d, "aal1");
    expect(idx.items.some((i) => i.key === "file:f2")).toBe(false);
    expect(d.calls.some((p) => p.startsWith("office_notes"))).toBe(false);
    expect(idx.sources.find((s) => s.key === "notes")).toMatchObject({ status: "denied", count: null });
    expect(idx.sources.find((s) => s.key === "files")?.detail).toMatch(/Finance room files hidden/);
  });
  it("a failed source is failed, other sources still listed", async () => {
    const idx = await read(db({ knowledge_documents: "fail" }));
    expect(idx.sources.find((s) => s.key === "documents")).toMatchObject({ status: "failed", count: null });
    expect(countByCategory(idx.items).downloads).toBe(4);
  });
});

describe("manual categories persist and reload", () => {
  it("a saved label re-files the item on the next read; originals unchanged; orphans kept", async () => {
    const d = db();
    (d.tables["office_notes"] as unknown[]).push(
      { id: categoryNoteId("file:f1"), kind: "decision", title: "file:f1", detail: "knowledge", source: CATEGORY_NOTE_SOURCE, provenance: "john", created_at: "9" },
      { id: categoryNoteId("file:gone"), kind: "decision", title: "file:gone", detail: "memory", source: CATEGORY_NOTE_SOURCE, provenance: "john", created_at: "9" },
      { id: categoryNoteId("note:n5"), kind: "decision", title: "note:n5", detail: "discussions", source: CATEGORY_NOTE_SOURCE, provenance: "john", created_at: "9" },
    );
    const idx = await read(d);
    expect(idx.items.find((i) => i.key === "file:f1")).toMatchObject({ category: "knowledge", manual: true, defaultCategory: "downloads", title: "Truck lease.pdf", folder: "CanX Projects" });
    expect(idx.items.find((i) => i.key === "note:n5")).toMatchObject({ category: "discussions", manual: true });
    expect(idx.orphanLabels).toBe(1);
    expect(idx.items.some((i) => i.title === "file:f1")).toBe(false); // label rows are not Brain items
  });
  it("invalid labels and derived items cannot be re-filed", () => {
    expect(isItemKey("project:x")).toBe(false);
    expect(isItemKey("skill:x")).toBe(false);
    expect(isItemKey("file:f1")).toBe(true);
    expect(categoryNoteId("file:f1")).toBe(categoryNoteId("file:f1"));
    expect(categoryNoteId("file:f1")).not.toBe(categoryNoteId("file:f2"));
    expect(categoryNoteId("file:" + "x".repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

describe("Elsie retrieval and the shared Brain snapshot", () => {
  it("search finds cross-room items and the model text says metadata only", async () => {
    const idx = await read(db());
    expect(searchBrain(idx.items, "lease").map((i) => i.key)).toContain("file:f1");
    const text = brainIndexForModel(idx, "find the truck lease");
    expect(text).toMatch(/METADATA INDEX ONLY/);
    expect(text).toMatch(/"Truck lease.pdf" · room legal · folder CanX Projects/);
    expect(text).toMatch(/Temporary chat history is neither/);
    expect(requestNeedsBrain("what's in my downloads?")).toBe(true);
    expect(requestNeedsBrain("hello", "/brain")).toBe(true);
    expect(requestNeedsBrain("hello", "/legal")).toBe(false);
  });
  it("the /brain room snapshot includes category counts from the same index", async () => {
    const d = db();
    const snap = await readRoomSnapshotWith({ config: CONFIG, token: "t", aal: "aal2", target: roomTargetForRoute("/brain")!, rest: d.rest, now: () => new Date("2026-10-03T22:00:00Z") });
    const src = snap.sources.find((s) => s.key === "brain-index")!;
    expect(src.status).toBe("read");
    expect(src.items).toContain("Downloads: 4");
    expect(src.detail).toMatch(/metadata index only/);
  });
  it("setBrainCategory saves one label and requires readback (source contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/brain-index.functions.ts", "utf8");
    expect(src).toMatch(/verifyOwner/);
    expect(src).toMatch(/could not be confirmed on re-read/);
    expect(src).not.toMatch(/office_files\?|DELETE|PATCH/);
    vi.fn();
  });
});
