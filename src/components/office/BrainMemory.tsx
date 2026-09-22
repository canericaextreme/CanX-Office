import { loadConversation, type SavedMessage } from "@/lib/manager-history.functions";
import { loadReviewArchive } from "@/lib/review-archive.functions";
import type { ClaudeReviewReply } from "@/lib/claude-review.functions";
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
  const readConversation = useServerFn(loadConversation);
  const readReviews = useServerFn(loadReviewArchive);
  const [turns, setTurns] = useState<SavedMessage[]>([]);
  const [reviews, setReviews] = useState<{entity_id:string;after:ClaudeReviewReply;at:string}[]>([]);
  const [archiveStatus, setArchiveStatus] = useState("Not loaded.");
  useEffect(() => {
    let active = true; setTurns([]); setReviews([]);
    if (!session.accessToken) return;
    void Promise.all([readConversation({data:{accessToken:session.accessToken}}), readReviews({data:{accessToken:session.accessToken}})])
      .then(([history, archive]) => { if (!active) return;
        setTurns(history.messages); setReviews(archive.reviews);
        setArchiveStatus(`${history.message} ${archive.message}`);
      }).catch(() => { if (active) setArchiveStatus("Archive could not be loaded. Reopen Brain to retry."); });
    return () => { active = false; };
  }, [session.accessToken, readConversation, readReviews]);
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
    const refresh = () => { void read({ data: { accessToken: session.accessToken! } }).then((result) => {
      if (!active) return;
      if (!result.ok) { setStatus(result.message); return; }
      const saved = (result.data ?? []).filter((note) => note.source.startsWith("CanX Brain:"));
      setNotes(saved);
      setStatus(saved.length ? `${saved.length} saved summaries. Data reads these shared records when answering.` : "No conversation summaries saved yet.");
    }).catch(() => { if (active) setStatus("Saved memory could not be read. Please reopen this room to retry."); });
    };
    refresh();
    window.addEventListener("canx-room-reports-changed", refresh);
    return () => { active = false; window.removeEventListener("canx-room-reports-changed", refresh); };
  }, [session.shared, session.accessToken, read]);
  return <Card className="border-border bg-card">
    <CardHeader><CardTitle className="text-base">Saved conversation memory</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      <p className="text-sm">Data conversations and ChatGPT imports are separate. The entries below are saved office conversations, not automatic summaries of chats outside this office.</p>
      <p role="status" className="text-sm">{archiveStatus}</p>
      <details><summary className="cursor-pointer font-medium">Saved Data conversation ({turns.length} recent entries)</summary>
        {turns.map(turn => <article key={turn.id} className="my-3 rounded border p-3"><strong>{turn.role === "user" ? "John" : "Data"}</strong><p className="whitespace-pre-wrap">{turn.content}</p><small>Record: {turn.id}</small></article>)}
      </details>
      <details><summary className="cursor-pointer font-medium">Saved Claude reviews ({reviews.length})</summary>
        {reviews.map(item => <article key={item.entity_id} className="my-3 rounded border p-3"><strong>{item.after.reviewedAt} — {item.after.review?.recommendation}</strong><pre className="whitespace-pre-wrap font-sans text-sm">{JSON.stringify(item.after.review, null, 2)}</pre><p>{item.after.coverage.join(" ")}</p><small>Record: {item.entity_id}</small></article>)}
      </details>
      {notes.map((note) => <article key={note.id} className="space-y-1 rounded-md border border-border p-3">
        <h3 className="font-medium">{note.title}</h3>
        <p className="whitespace-pre-wrap text-sm">{note.detail}</p>
        <p className="text-xs text-muted-foreground">{note.source}</p>
      </article>)}
    </CardContent>
  </Card>;
}
