import { useState } from "react";
import type { OfficeNote } from "@/lib/office-notes";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";
import { roomReportSource } from "@/lib/manager-room-commands";
import { checklistDetail, checklistSections, SECURITY_STAGES } from "@/lib/room-note-edit";
import { Button } from "@/components/ui/button";

export function RoomNoteEditor({
  note,
  checklist = false,
  onSave,
  onCancel,
}: {
  note: OfficeNote;
  checklist?: boolean;
  onSave: (note: OfficeNote) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [detail, setDetail] = useState(note.detail);
  const [source, setSource] = useState(note.source);
  const [sections, setSections] = useState(() => checklistSections(note.detail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const content = checklist ? checklistDetail(sections) : detail;
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSave({ ...note, title, detail: content, source });
        } catch (error) {
          setError(error instanceof Error ? error.message : "Save was not confirmed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-3">
        {checklist ? (
          SECURITY_STAGES.map((stage, index) => (
            <label key={stage} className="block text-sm font-medium">
              {stage}
              <textarea
                className="mt-1 block min-h-24 w-full rounded border bg-background p-2"
                maxLength={1800}
                value={sections[index]}
                placeholder="One checklist item per line"
                onChange={(event) =>
                  setSections(
                    sections.map((value, i) => (i === index ? event.target.value : value)),
                  )
                }
              />
            </label>
          ))
        ) : (
          <>
            <label className="block text-sm font-medium">
              Title
              <input
                required
                maxLength={300}
                className="mt-1 block w-full rounded border bg-background p-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Note
              <textarea
                maxLength={2000}
                className="mt-1 block min-h-32 w-full rounded border bg-background p-2"
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Destination room
              <select
                className="mt-1 block w-full rounded border bg-background p-2"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                {OFFICE_ROOM_IDENTITIES.filter((room) => !room.reserved).map((room) => (
                  <option key={room.id} value={roomReportSource(room.id)}>
                    {room.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <p className="text-xs text-muted-foreground">{content.length}/2000 characters</p>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!title.trim() || content.length > 2000}>
            {busy ? "Saving…" : "Save note"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
