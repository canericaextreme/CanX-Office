import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSharedNotes, saveSharedNotes } from "@/lib/records.functions";
import { parseContinuityImport, newContinuityNotes } from "@/lib/continuity-import";
import { useOwnerSession } from "@/lib/owner-session";
import type { OfficeNote } from "@/lib/office-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Private, owner-scoped records; no conversation content is bundled in code. */
export function BrainMemory() {
  const session = useOwnerSession();
  const read = useServerFn(listSharedNotes);
  const save = useServerFn(saveSharedNotes);
  const [notes, setNotes] = useState<OfficeNote[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
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
      setStatus(saved.length ? `${saved.length} saved summaries. Astra reads these shared records when answering.` : "No conversation summaries saved yet.");
    }).catch(() => { if (active) setStatus("Saved memory could not be read. Please reopen this room to retry."); });
    return () => { active = false; };
  }, [session.shared, session.accessToken, read, refresh]);
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1);
    window.addEventListener("canx:workbench-changed", reload);
    return () => window.removeEventListener("canx:workbench-changed", reload);
  }, []);
  const importFile = async (file: File) => {
    if (importing || !session.accessToken || !session.stepUpComplete) return;
    setImporting(true);
    setImportStatus("Checking the handover and existing memory…");
    try {
      if (file.size > 50000) throw new Error("The handover file is too large.");
      const rows = parseContinuityImport(await file.text());
      const before = await read({ data: { accessToken: session.accessToken } });
      if (!before.ok || !before.data) throw new Error(before.message || "Existing memory could not be checked.");
      const added = newContinuityNotes(rows, before.data);
      if (!added.length) { setImportStatus("These continuity records are already saved."); return; }
      const result = await save({ data: { accessToken: session.accessToken, notes: added } });
      if (!result.ok) throw new Error(result.message);
      const after = await read({ data: { accessToken: session.accessToken } });
      if (!after.ok || !added.every(note => after.data?.some(saved => saved.id === note.id && saved.title === note.title && saved.detail === note.detail && saved.source === note.source))) {
        throw new Error("The handover save could not be verified. Check saved memory before retrying.");
      }
      setImportStatus(`${added.length} continuity records saved and verified. Existing records retained.`);
      window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Handover import failed.");
    } finally { setImporting(false); }
  };
  return <Card className="border-border bg-card">
    <CardHeader><CardTitle className="text-base">Saved conversation memory</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      <p className="text-sm">Astra continuity rule: carry forward saved goals, decisions and ideas. Keep the existing history, accept corrections, and say when a memory is missing. Imported continuity records remain in Astra’s context alongside recent summaries.</p>
      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Import conversation handover</summary>
        <p className="my-2 text-sm text-muted-foreground">Add a prepared handover file to private CanX Brain memory. This adds records; it does not replace existing history or connect ChatGPT automatically.</p>
        <input aria-label="Conversation handover file" type="file" accept=".json,application/json" disabled={importing || !session.stepUpComplete || !session.accessToken}
          onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
        <p role="status" className="mt-2 text-sm">{importStatus}</p>
      </details>
      {notes.map((note) => <article key={note.id} className="space-y-1 rounded-md border border-border p-3">
        <h3 className="font-medium">{note.title}</h3>
        <p className="whitespace-pre-wrap text-sm">{note.detail}</p>
        <p className="text-xs text-muted-foreground">{note.source}</p>
      </article>)}
    </CardContent>
  </Card>;
}
