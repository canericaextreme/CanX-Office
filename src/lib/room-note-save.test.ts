import { describe, expect, it } from "vitest";
import { saveRoomNoteWith } from "./room-note-save.server";
import {
  checklistDetail,
  checklistSections,
  isSecurityChecklist,
  SECURITY_CHECKLIST_TITLE,
} from "./room-note-edit";

import { fixture, note } from "../../tests/room-note-fixture";

describe("normal room note persistence", () => {
  it("updates and reads back a destination change, preserving original metadata and unrelated records", async () => {
    const f = fixture();
    f.data.set("other", { id: "other", title: "Keep" });
    await saveRoomNoteWith(
      f.rest,
      "owner",
      { ...note, title: "Edited", detail: "After reload", source: "Data room report: legal" },
      note,
    );
    expect(f.data.get(note.id)).toMatchObject({
      title: "Edited",
      detail: "After reload",
      source: "Data room report: legal",
      provenance: "ai-proposal",
      created_at: note.createdAt,
    });
    expect(f.data.get("other")).toEqual({ id: "other", title: "Keep" });
  });
  it("refuses stale edits and wrong-owner updates without replacing content", async () => {
    const f = fixture();
    f.data.get(note.id)!["detail"] = "Concurrent edit";
    await expect(
      saveRoomNoteWith(f.rest, "owner", { ...note, detail: "Overwrite" }, note),
    ).rejects.toThrow("changed");
    await expect(saveRoomNoteWith(f.rest, "someone-else", note, note)).rejects.toThrow("changed");
    expect(f.data.get(note.id)!["detail"]).toBe("Concurrent edit");
  });
  it("does not confirm failed writes or failed readback", async () => {
    const f = fixture();
    f.state.failWrite = true;
    await expect(saveRoomNoteWith(f.rest, "owner", note, note)).rejects.toThrow(
      "could not be saved",
    );
    f.state.failWrite = false;
    f.state.failRead = true;
    await expect(saveRoomNoteWith(f.rest, "owner", note, note)).rejects.toThrow(
      "persistence could not be confirmed",
    );
  });
  it("rejects invalid rooms and oversized content; creates without upserting an existing record", async () => {
    const f = fixture();
    await expect(
      saveRoomNoteWith(f.rest, "owner", { ...note, source: "Lovable project import" }, note),
    ).rejects.toThrow("Invalid");
    await expect(
      saveRoomNoteWith(f.rest, "owner", { ...note, detail: "x".repeat(2001) }, note),
    ).rejects.toThrow("Invalid");
    await expect(saveRoomNoteWith(f.rest, "owner", note, null)).rejects.toThrow(
      "could not be confirmed",
    );
    await saveRoomNoteWith(f.rest, "owner", { ...note, id: "new" }, null);
    expect(f.data.size).toBe(2);
  });
  it("round-trips all checklist statuses without interpreting note text as progress", () => {
    const sections = [
      "Reviewed guards",
      "Reviewing filing",
      "Mobile reload\nNeeds improvement:",
      "Clearer labels",
    ];
    expect(checklistSections(checklistDetail(sections))).toEqual(sections);
    expect(isSecurityChecklist({ ...note, title: SECURITY_CHECKLIST_TITLE })).toBe(false);
    expect(
      isSecurityChecklist({
        ...note,
        title: SECURITY_CHECKLIST_TITLE,
        detail: checklistDetail(sections),
      }),
    ).toBe(true);
  });
});
