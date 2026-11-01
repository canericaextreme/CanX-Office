import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerSession } from "@/lib/owner-session";
import { decideEmail, readEmailReview, type EmailReviewReply } from "@/lib/email-review.functions";
import type { EmailDecision } from "@/lib/email-review";

type Entry = Extract<EmailReviewReply, { ok: true }>["entries"][number];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Emails card on Owner's Desk: what the 6 a.m. sweep collected in the last 48 hours,
 * with Accept and Ignore for each email. Ignore leaves that sender out of future
 * sweeps; nothing in Gmail is changed.
 */
export function EmailsCard() {
  const session = useOwnerSession();
  const token = session.signedIn && !session.viewer ? session.accessToken : null;
  const read = useServerFn(readEmailReview);
  const decide = useServerFn(decideEmail);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const r = await read({ data: { accessToken: token } }).catch(() => null);
    if (r?.ok) {
      setEntries(r.entries);
      setMessage(null);
    } else setMessage(r && !r.ok ? r.message : "The saved email sweep could not be read just now.");
  }, [token, read]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function choose(entry: Entry, decision: EmailDecision) {
    if (!token || busy) return;
    setBusy(entry.messageId);
    const r = await decide({ data: { accessToken: token, messageId: entry.messageId, sender: entry.from, decision } }).catch(() => null);
    setBusy(null);
    setMessage(r ? (r.ok ? r.detail : r.message) : "Your choice could not be saved. Please try again.");
    if (r?.ok) await refresh();
  }

  if (!token) return null;

  return (
    <Card className="border-border bg-card lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Emails</CardTitle>
        <p className="text-xs text-muted-foreground">
          What the 6 a.m. sweep collected in the last 48 hours. Ignore leaves that sender out of future sweeps. Your
          Gmail is never changed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <p role="status" aria-live="polite" className="text-sm text-canx-yellow">
            {message}
          </p>
        )}
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Reading the saved email sweep…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No swept emails saved in the last 48 hours.</p>
        ) : (
          <ul className="space-y-2" aria-label="Swept emails">
            {entries.map((e) => (
              <li key={e.messageId} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{e.subject}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {e.from} · {e.mailbox} · {when(e.received)}
                    </p>
                    {e.outcome && <p className="text-xs text-muted-foreground">Sweep: {e.outcome}</p>}
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" className="text-xs underline">
                        Open in Gmail
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {e.decision === "accept" ? (
                      <span className="text-xs text-canx-green">Accepted</span>
                    ) : e.decision === "ignore" || e.excluded ? (
                      <span className="text-xs text-muted-foreground">Ignored: sender left out of future sweeps</span>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void choose(e, "accept")}>
                          Accept this email
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy !== null || !e.sender} onClick={() => void choose(e, "ignore")}>
                          Ignore this email
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
