import { useMemo, useState } from "react";
import { Loader2, MailSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/office/StatusBadge";
import { syncGmailReceipts } from "@/lib/receipt-ingestion.functions";
import { createCheckEmailsController, type CheckState } from "@/lib/check-emails-now";
import { DEFAULT_GMAIL_SCAN_FROM_DATE, validScanDate, type GmailScanConfig } from "@/lib/gmail-scan-window";
import { zonedDate } from "@/lib/subscriptions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckEmailsResult({ state }: { state: CheckState }) {
  if (state.phase === "idle") return null;
  if (state.phase === "running") {
    return (
      <div
        className="email-check-sheen rounded-md border border-canx-yellow/45 bg-canx-yellow/10 px-3 py-2 text-xs text-foreground"
        role="status"
        aria-live="polite"
        data-email-check-state="running"
      >
        <span className="relative z-10 flex flex-wrap items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-canx-yellow motion-reduce:hidden" aria-hidden />
          <span className="rounded-full border border-canx-yellow/70 bg-canx-yellow/25 px-2 py-0.5 font-semibold">Working now</span>
          <span>Checking emails… Both linked mailboxes are being checked. No progress estimate — this waits for the real result.</span>
        </span>
      </div>
    );
  }
  if (state.phase === "failed") return <p className="text-xs text-destructive" role="alert">Check not completed: {state.message}</p>;
  const r = state.result;
  const complete = !r.partial && !r.mailboxesFailed;
  const stoppedLabel = r.mailboxesFailed ? "Stopped — some mail could not be checked" : "Stopped — more mail remains";
  return (
    <div className="rounded-md border border-border/50 p-2 text-xs" role="status" data-email-check-state={complete ? "complete" : "partial"}>
      <StatusBadge tone={complete ? "green" : "yellow"} label={complete ? "Finished — complete within scope" : stoppedLabel} />
      <p className="mt-1 text-foreground">Receipts/invoices: {r.filed} new filed in Finance, {r.duplicatesSkipped} duplicates skipped, {r.sentToReview ?? 0} sent to review. Notices/evidence: {r.subscriptionEvidenceAdded ?? 0} new, {r.subscriptionEvidenceDuplicates ?? 0} already recorded.{r.ignoredByPreference ? ` Skipped by your Ignore choices: ${r.ignoredByPreference}.` : ""}</p>
      <ul className="mt-1 text-muted-foreground">
        {(r.mailboxes ?? []).map((m, i) => (
          <li key={`${m.mailbox}-${i}`}>{m.mailbox}: {m.status === "read" ? `${m.documents} item(s) read${m.partial ? " — limit reached, more mail not checked" : ""}` : m.status === "authorization_required" ? "access refused — re-authorise" : "could not be read"}</li>
        ))}
      </ul>
      <p className="mt-1 text-muted-foreground">{r.message}</p>
      {!complete ? <p className="mt-1 text-foreground">Partial — not all mail checked. This check has stopped. Review the mailbox details above, then press Check emails now later to try again; there is no automatic scan.</p> : null}
    </div>
  );
}

export function CheckEmailsNow({ accessToken, onVerified, savedScan }: { accessToken: string | null; onVerified: () => void; savedScan?: GmailScanConfig | null }) {
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const [fromDate, setFromDate] = useState(savedScan?.fromDate ?? DEFAULT_GMAIL_SCAN_FROM_DATE);
  const controller = useMemo(
    () => createCheckEmailsController({
      run: (request, requestedFrom) => syncGmailReceipts({ data: { accessToken: accessToken ?? "", request, fromDate: requestedFrom ?? fromDate } }),
      onState: setState,
      onVerified,
    }),
    [accessToken, fromDate, onVerified],
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
      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="historical-mail-from">From date</Label>
            <Input id="historical-mail-from" type="date" value={fromDate} max={zonedDate(new Date())} onChange={(event) => setFromDate(event.target.value)} className="h-11 w-48" />
          </div>
          <Button variant="outline" onClick={() => void controller.start(fromDate, true)} disabled={running || !accessToken || !validScanDate(fromDate)} aria-busy={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MailSearch className="h-4 w-4" aria-hidden />}
            {running ? "Scanning…" : "Scan from this date"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Includes the whole selected day in America/Whitehorse through the frozen start time. Checks only billing, renewal, receipt, subscription, and known-service mail in both linked mailboxes. It processes up to four verified page steps per press, then pauses safely if more remains.</p>
        {savedScan ? <p className="mt-1 text-xs text-foreground">Saved dated scan: {savedScan.fromDate} · {savedScan.status === "complete" ? "complete within scope" : savedScan.status === "failed" ? "failed — resume after fixing the issue" : "paused — ready to resume"}.</p> : null}
      </div>
      <CheckEmailsResult state={state} />
    </section>
  );
}
