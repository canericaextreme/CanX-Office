import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOX_DESCRIPTIONS, boxDescription, boxDescriptionLine } from "./box-descriptions";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { screenForModel } from "./room-guide";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) ? [p] : [];
  });
}

/** Every fixed box id written in the code, e.g. <RoomBox id="finance.receipts" ...>. */
const shippedIds = files("src")
  .flatMap((p) => [...readFileSync(p, "utf8").matchAll(/<RoomBox[^>]*?\bid="([^"]+)"/g)])
  .map((m) => m[1]!);

describe("box labels (John 12 Nov: every box shows a description and purpose on hover)", () => {
  it("finds the boxes in the code", () => {
    expect(shippedIds.length).toBeGreaterThan(80);
  });

  it("every fixed box has a written label (its own line or a shared rule, never the catch-all)", () => {
    const missing = shippedIds.filter((id) => /^X, part of /.test(boxDescription(id, "X").what));
    expect(missing).toEqual([]);
  });

  it("every label says what the box is and what it is for, in short plain words", () => {
    for (const [id, b] of Object.entries(BOX_DESCRIPTIONS)) {
      expect(b.what.length, id).toBeGreaterThan(10);
      expect(b.why.length, id).toBeGreaterThan(10);
      expect(b.what.length + b.why.length, id).toBeLessThan(260);
    }
  });

  it("no written label is left over for a box that no longer exists", () => {
    const known = new Set(shippedIds);
    const dynamic = /^(reception\.shortcut-|idea-garage\.stage-|skills\.group-)/;
    const stale = Object.keys(BOX_DESCRIPTIONS).filter((id) => !known.has(id) && !dynamic.test(id));
    expect(stale).toEqual([]);
  });

  it("boxes built from lists and every room's shared boxes still get a label", () => {
    for (const room of OFFICE_ROOM_IDENTITIES) {
      if (BOX_DESCRIPTIONS[`${room.id}.files`]) continue;
      expect(boxDescription(`${room.id}.files`, "Saved files and links").what).toContain(
        room.label,
      );
    }
    for (const room of OFFICE_ROOM_IDENTITIES) {
      expect(boxDescription(`${room.id}.skills`, "Room skills").what).toMatch(/skills/);
    }
    expect(boxDescription("records.knowledge-x", "Idea Lab rules").what).toContain(
      "Idea Lab rules",
    );
    expect(boxDescription("round-table.queued-abc", "Queued — x").what).toMatch(/queued/);
    expect(boxDescription("round-table.review-abc", "Review").what).toMatch(/second-eyes/);
    expect(boxDescription("reception.shortcut-subscriptions", "Subscriptions").what).toContain(
      "Subscriptions",
    );
    expect(boxDescription("research.setup", "Room setup stage").what).toContain("Research");
    const unknown = boxDescription("finance.something-new", "Something new");
    expect(unknown.what).toContain("Finance");
    expect(unknown.why.length).toBeGreaterThan(5);
  });

  it("Elsie's room guide uses the same words John sees on hover", () => {
    const text = screenForModel(
      {
        route: "/finance",
        collectedAt: new Date().toISOString(),
        editing: false,
        boxes: [
          { id: "finance.receipts", name: "Receipt records", renamed: "My receipts", excerpt: "" },
        ],
      },
      "/finance",
      true,
    );
    expect(text).toContain(boxDescriptionLine("finance.receipts", "Receipt records"));
    const short = screenForModel(
      {
        route: "/finance",
        collectedAt: new Date().toISOString(),
        editing: false,
        boxes: [{ id: "finance.receipts", name: "Receipt records", excerpt: "" }],
      },
      "/finance",
      false,
    );
    expect(short).not.toContain("about (box label");
  });
});
