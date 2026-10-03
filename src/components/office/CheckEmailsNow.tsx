import { useMemo, useState } from "react";
import { Loader2, MailSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/office/StatusBadge";
import { syncGmailReceipts } from "@/lib/receipt-ingestion.functions";
import { createCheckEmailsController, type CheckState } from "@/lib/check-emails-now";

export function CheckEmailsResult({ state }: { state: CheckState }) {
  if (state.phase === "idle") return null;
  if (state.phase === "running") return <p className="text-xs text-muted-foreground">Checking both linked mailboxes… (no progress estimate — this waits for the real result)</p>;
  if (state.phase === "failed") return <p className="text-xs text-destructive" role="alert">Check not completed: {state.message}</p>;
  const r = state.result;
  const complete = !r.partial && !r.mailboxesFailed;
  return (
    <div className="rounded-md border border-border/50 p-2 text-xs" role="status">
      <StatusBadge tone={complete ? "green" : "yellow"} label={complete ? "Finished — complete within scope" : "Finished — partial"} />
      <p className="mt-1 text-foreground">Receipts/invoices: {r.filed} new filed in Finance, {r.duplicatesSkipped} duplicates skipped, {r.sentToReview ?? 0} sent to review. Notices/evidence: {r.subscriptionEvidenceAdded ?? 0} new, {r.subscriptionEvidenceDuplicates ?? 0} already recorded.</p>
      <ul className="mt-1 text-muted-foreground">
        {(r.mailboxes ?? []).map((m, i) => (
          <li key={`${m.mailbox}-${i}`}>{m.mailbox}: {m.status === "read" ? `${m.documents} item(s) read${m.partial ? " — limit reached, more mail not checked" : ""}` : m.status === "authorization_required" ? "access refused — re-authorise" : "could not be read"}</li>
        ))}
      </ul>
      <p className="mt-1 text-muted-foreground">{r.message}</p>
    </div>
  );
}

export function CheckEmailsNow({ accessToken, onVerified }: { accessToken: string | null; onVerified: () => void }) {
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const controller = useMemo(
    () => createCheckEmailsController({
      run: (request) => syncGmailReceipts({ data: { accessToken: accessToken ?? "", request } }),
      onState: setState,
      onVerified,
    }),
    [accessToken, onVerified],
  );
  const running = state.phase === "running";
  return (
    <section aria-label="Check emails now" className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void controller.start()} disabled={running || !accessToken} aria-busy={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MailSearch className="h-4 w-4" aria-hidden />}
          {running ? "Checking…" : "Check emails now"}
        </Button>
        <span className="text-xs text-muted-foreground">Same check as asking Elsie. Needs owner sign-in with two-step verification. Read-only: nothing is sent or deleted; runs only when pressed.</span>
      </div>
      <CheckEmailsResult state={state} />
    </section>
  );
}
