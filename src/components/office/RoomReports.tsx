import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { listSharedNotes, saveSharedRoomNote } from "@/lib/records.functions";
import { roomIdentityForRoute } from "@/lib/office-room-identity";
import { roomReportSource } from "@/lib/manager-room-commands";
import { RoomNoteEditor } from "./RoomNoteEditor";
import { Button } from "@/components/ui/button";
import {
  isSecurityChecklist,
  SECURITY_CHECKLIST_TITLE,
  SECURITY_STAGES,
  checklistSections,
} from "@/lib/room-note-edit";
import type { OfficeNote } from "@/lib/office-notes";

/** Account-backed room reports. No device cache or fabricated success state. */
export function RoomReports({ securityOnly = false }: { securityOnly?: boolean }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const room = roomIdentityForRoute(path);
  const session = useOwnerSession();
  const list = useServerFn(listSharedNotes);
  const save = useServerFn(saveSharedRoomNote);
  const [editing, setEditing] = useState<OfficeNote | null>(null);
  const [previous, setPrevious] = useState<OfficeNote | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [reports, setReports] = useState<OfficeNote[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let sequence = 0;
    setReports([]);
    setLoaded(false);
    setEditing(null);
    setNotice("");
    setError("");
    const load = async () => {
      const current = ++sequence;
      if (!session.accessToken || !session.canReadProtected || !room) return;
      try {
        const reply = await list({
          data: {
            accessToken: session.accessToken,
            source: roomReportSource(room.id),
            ...(securityOnly ? { title: SECURITY_CHECKLIST_TITLE } : {}),
          },
        });
        if (!active || current !== sequence) return;
        if (!reply.ok) {
          setError("Room reports could not be loaded.");
          return;
        }
        setReports((reply.data ?? []).filter((note) => note.source === roomReportSource(room.id)));
        setError("");
        setLoaded(true);
      } catch {
        if (active && current === sequence) setError("Room reports could not be loaded.");
      }
    };
    void load();
    window.addEventListener("canx:room-reports-changed", load);
    return () => {
      active = false;
      window.removeEventListener("canx:room-reports-changed", load);
    };
  }, [room, session.accessToken, session.canReadProtected, list, securityOnly]);
  if (!room || !session.canReadProtected) return null;
  const visible = reports.filter((note) =>
    securityOnly ? isSecurityChecklist(note) : !isSecurityChecklist(note),
  );
  const canEdit = session.shared && !session.viewer && !room.reserved;
  const begin = (note: OfficeNote | null) => {
    setNotice("");
    setPrevious(note);
    setEditing(
      note ?? {
        id: crypto.randomUUID(),
        kind: "decision",
        title: securityOnly ? SECURITY_CHECKLIST_TITLE : "",
        detail: "",
        owner: "John",
        provenance: "john",
        source: roomReportSource(room.id),
        createdAt: new Date().toISOString(),
      },
    );
  };
  return (
    <section
      aria-label={securityOnly ? "Security work-in-progress checklist" : "Room reports"}
      className="mx-auto max-w-6xl space-y-3 px-4 py-6"
    >
      <h2 className="text-xl font-semibold">
        {securityOnly ? "Security work-in-progress checklist" : "Room notes & reports"}
      </h2>
      {securityOnly && (
        <p className="text-sm text-muted-foreground">
          Owner-maintained progress, not a security audit or live verification. Enter one item per
          line in each status.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {reports.length >= 300 && (
        <p role="status">Showing the latest 300 room notes; older notes may exist.</p>
      )}
      {!loaded && !error && <p role="status">Loading saved notes…</p>}
      {editing ? (
        <RoomNoteEditor
          key={editing.id}
          note={editing}
          checklist={securityOnly}
          onCancel={() => setEditing(null)}
          onSave={async (note) => {
            const reply = await save({
              data: { accessToken: session.accessToken ?? "", note, previous },
            });
            if (!reply.ok || !reply.data)
              throw new Error(reply.message || "Save was not confirmed.");
            setEditing(null);
            setNotice("Saved and re-read from the CanX account.");
            window.dispatchEvent(new Event("canx:room-reports-changed"));
          }}
        />
      ) : (
        <>
          {visible.length === 0 && loaded && (
            <p>
              {securityOnly
                ? "No checklist saved yet. No security work is marked complete."
                : "No notes filed in this room yet."}
            </p>
          )}
          {visible.map((report) => (
            <article key={report.id} className="rounded-xl border bg-card p-4">
              <h3 className="font-semibold">{report.title}</h3>
              {securityOnly ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {SECURITY_STAGES.map((stage, index) => (
                    <div key={stage}>
                      <h4 className="font-medium">{stage}</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {(checklistSections(report.detail)[index] || "No items recorded")
                          .split("\n")
                          .filter(Boolean)
                          .map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap">{report.detail}</p>
              )}
              <p className="my-2 text-xs text-muted-foreground">
                Saved at John's request · Created {new Date(report.createdAt).toLocaleString()}
              </p>
              {canEdit && (
                <Button variant="outline" onClick={() => begin(report)}>
                  {securityOnly ? "Edit checklist" : "Edit note"}
                </Button>
              )}
            </article>
          ))}
          {canEdit && loaded && !error && (!securityOnly || visible.length === 0) && (
            <Button variant="outline" onClick={() => begin(null)}>
              {securityOnly ? "Start Security checklist" : "Add room note"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
