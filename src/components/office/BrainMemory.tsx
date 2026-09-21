import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSharedNotes } from "@/lib/records.functions";
import { useOwnerSession } from "@/lib/owner-session";
import type { OfficeNote } from "@/lib/office-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Private, owner-scoped records; no conversation content is bundled in code. */
export function BrainMemory() {
  const session = useOwnerSession();
  const read = useServerFn(listSharedNotes);
  const [notes, setNotes] = useState<OfficeNote[]>([]);
  const [status, setStatus] = useState("Sign in with your authenticator to read saved memory.");
  useEffect(() => {
    let active = true;
    setNotes([]);
    if (!session.shared || !session.accessToken) {
      setStatus("Sign in with your authenticator to read saved memory.");
      return;
    }
    setStatus("Reading saved memory…");
    void read({ data: { accessToken: session.accessToken } }).then((result) => {
      if (!active) return;
      if (!result.ok) { setStatus(result.message); return; }
      const saved = (result.data ?? []).filter((note) => note.source.startsWith("CanX Brain:"));
      setNotes(saved);
      setStatus(saved.length ? `${saved.length} saved summaries. Data reads these shared records when answering.` : "No conversation summaries saved yet.");
    }).catch(() => { if (active) setStatus("Saved memory could not be read. Please reopen this room to retry."); });
    return () => { active = false; };
  }, [session.shared, session.accessToken, read]);
  return <Card className="border-border bg-card">
    <CardHeader><CardTitle className="text-base">Saved conversation memory</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      {notes.map((note) => <article key={note.id} className="space-y-1 rounded-md border border-border p-3">
        <h3 className="font-medium">{note.title}</h3>
        <p className="whitespace-pre-wrap text-sm">{note.detail}</p>
        <p className="text-xs text-muted-foreground">{note.source}</p>
      </article>)}
    </CardContent>
  </Card>;
}
