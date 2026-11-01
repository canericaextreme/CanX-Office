import type { OfficeNote } from "./office-notes";
import { isRoomNoteSource } from "./room-note-edit";

type Reply = { ok: boolean; body: unknown };
type Rest = (path: string, init?: RequestInit) => Promise<Reply>;
const rows = (reply: Reply) =>
  reply.ok && Array.isArray(reply.body) ? (reply.body as Record<string, unknown>[]) : [];
const filter = (value: string) =>
  `eq.${encodeURIComponent(`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)}`;

/** Update only the named note, preserve provenance, and refuse stale edits. */
export async function saveRoomNoteWith(
  rest: Rest,
  ownerId: string,
  note: OfficeNote,
  previous: OfficeNote | null,
) {
  if (
    !note ||
    typeof note.id !== "string" ||
    note.id.length > 60 ||
    typeof note.title !== "string" ||
    typeof note.detail !== "string" ||
    !isRoomNoteSource(note.source) ||
    !note.title.trim() ||
    note.title.length > 300 ||
    note.detail.length > 2000 ||
    !note.id ||
    (previous &&
      (previous.id !== note.id ||
        typeof previous.title !== "string" ||
        typeof previous.detail !== "string" ||
        !isRoomNoteSource(previous.source)))
  )
    throw new Error("Invalid room note.");
  const path = `office_notes?owner_id=${filter(ownerId)}&id=${filter(note.id)}`;
  if (previous) {
    const response = await rest(
      `${path}&title=${filter(previous.title)}&detail=${filter(previous.detail)}&source=${filter(previous.source)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          title: note.title.trim(),
          detail: note.detail,
          source: note.source,
        }),
      },
    );
    if (rows(response).length !== 1)
      throw new Error("The note changed or could not be saved. Reload before editing again.");
  } else {
    const response = await rest("office_notes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: note.id,
        owner_id: ownerId,
        kind: note.kind,
        title: note.title.trim(),
        detail: note.detail,
        source: note.source,
        provenance: "john",
        owner_name: "John",
        created_at: note.createdAt,
      }),
    });
    if (rows(response).length !== 1)
      throw new Error("The new note could not be confirmed. Reload before retrying.");
  }
  const readback = rows(await rest(`${path}&select=id,title,detail,source`))[0];
  if (
    !readback ||
    readback["id"] !== note.id ||
    readback["title"] !== note.title.trim() ||
    readback["detail"] !== note.detail ||
    readback["source"] !== note.source
  )
    throw new Error(
      "Save was sent but persistence could not be confirmed. Reload before retrying.",
    );
  return { ...note, title: note.title.trim() };
}
