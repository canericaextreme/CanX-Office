import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { listSharedNotes } from "@/lib/records.functions";
import { roomByRoute } from "@/lib/office-data";
import { roomReportSource } from "@/lib/manager-room-commands";
import type { OfficeNote } from "@/lib/office-notes";

/** Account-backed room reports. No device cache or fabricated success state. */
export function RoomReports() {
  const path = useRouterState({ select: state => state.location.pathname });
  const room = roomByRoute(path);
  const session = useOwnerSession();
  const list = useServerFn(listSharedNotes);
  const [reports, setReports] = useState<OfficeNote[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let sequence = 0;
    setReports([]);
    setError("");
    const load = async () => {
      const current = ++sequence;
      if (!session.accessToken || !session.stepUpComplete || !room) return;
      try {
        const reply = await list({ data: { accessToken: session.accessToken } });
        if (!active || current !== sequence) return;
        if (!reply.ok) { setError("Room reports could not be loaded."); return; }
        setReports((reply.data ?? []).filter(note => note.source === roomReportSource(room.id)));
        setError("");
      } catch { if (active && current === sequence) setError("Room reports could not be loaded."); }
    };
    void load();
    window.addEventListener("canx:room-reports-changed", load);
    return () => { active = false; window.removeEventListener("canx:room-reports-changed", load); };
  }, [room, session.accessToken, session.stepUpComplete, list]);
  if (!reports.length && !error) return null;
  return <section aria-label="Room reports" className="mx-auto max-w-6xl space-y-3 px-4 py-6">
    <h2 className="text-xl font-semibold">Room reports</h2>
    {error && <p role="status">{error}</p>}
    {reports.map(report => <article key={report.id} className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">{report.title}</h3>
      <p className="mt-2 whitespace-pre-wrap">{report.detail}</p>
      <p className="mt-2 text-xs text-muted-foreground">Saved at John's request · {new Date(report.createdAt).toLocaleString()}</p>
    </article>)}
  </section>;
}
