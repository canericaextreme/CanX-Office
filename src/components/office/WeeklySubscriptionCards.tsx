import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, ExternalLink, Mail } from "lucide-react";
import { StatusBadge } from "@/components/office/StatusBadge";
import { formatZoned, gmailLink, OFFICE_TIMEZONE, type LastCheck, type SubscriptionEvidence, type WeeklyView } from "@/lib/subscriptions";

const KIND: Record<SubscriptionEvidence["kind"], string> = {
  receipt: "Receipt (paid)",
  "unpaid-invoice": "Invoice — unpaid as stated",
  "renewal-notice": "Renewal notice",
  "price-change": "Price change notice",
  "failed-payment": "Failed / declined payment",
  unknown: "Unclassified",
};

function money(a: number | null, c: string | null) {
  return a === null ? "amount not stated" : `${a.toFixed(2)} ${c ?? "(currency not stated)"}`;
}

function SourceLinks({ e }: { e: SubscriptionEvidence }) {
  const url = gmailLink(e.mailbox, e.messageId);
  return (
    <span className="flex flex-wrap gap-3">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
          Open email in {e.mailbox || "mailbox"} <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : (
        <span>Source: {e.mailbox || "linked mailbox"} · message {e.messageId.slice(0, 12)}</span>
      )}
      {(e.kind === "receipt" || e.kind === "unpaid-invoice") && e.matchStatus !== "personal" && (
        <Link to="/finance" className="underline">Filed in Finance (needs review)</Link>
      )}
    </span>
  );
}

export function LastCheckSummary({ check }: { check: LastCheck | null }) {
  if (!check) return <p className="text-xs text-muted-foreground">Mailboxes not checked yet. Ask Elsie to "check receipts and subscriptions".</p>;
  return (
    <div className="rounded-md border border-border/50 p-3 text-xs" aria-label="Last mailbox check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">Last checked {formatZoned(check.at)}</span>
        <StatusBadge tone={check.complete ? "green" : "yellow"} label={check.complete ? "Complete within scope" : "Partial — not all mail checked"} />
      </div>
      <p className="mt-1 text-muted-foreground">Scope: {check.scope}</p>
      <ul className="mt-1 space-y-0.5">
        {check.mailboxes.map((m, i) => (
          <li key={`${m.mailbox}-${i}`} className="text-muted-foreground">
            {m.mailbox}: {m.status === "read" ? `${m.documents} matching item(s) read${m.partial ? " — capped, more mail not read" : ""}` : m.status === "authorization_required" ? "access refused — re-authorise" : "check failed"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeeklySubscriptionCards({ view, lastCheck }: { view: WeeklyView; lastCheck: LastCheck | null }) {
  return (
    <section aria-label="This week in subscriptions" className="space-y-3">
      <p className="text-xs text-muted-foreground">{view.week.label}. Dates shown in {OFFICE_TIMEZONE} time. Counts are from saved billing evidence only, not the whole inbox.</p>
      <LastCheckSummary check={lastCheck} />
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-border bg-muted/20 p-3" aria-labelledby="wk-emails">
          <h3 id="wk-emails" className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" aria-hidden /> This week’s emails ({view.emails.length})</h3>
          {view.emails.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No subscription-related email recorded for this week.</p> : (
            <ul className="mt-2 space-y-2">
              {view.emails.map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="font-medium text-foreground">{KIND[e.kind]} · {e.vendor || "Unknown sender"}</div>
                  <div className="text-muted-foreground">Received {e.receivedAt ? formatZoned(e.receivedAt) : "time unknown"} · {money(e.amount, e.currency)}</div>
                  <SourceLinks e={e} />
                </li>
              ))}
            </ul>
          )}
          {view.emailsUnknownTime.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{view.emailsUnknownTime.length} older saved item(s) have no recorded email received time, so they are not counted as this week’s mail.</p>
          )}
        </article>
        <article className="rounded-lg border border-border bg-muted/20 p-3" aria-labelledby="wk-alerts">
          <h3 id="wk-alerts" className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden /> This week’s alerts ({view.alerts.length})</h3>
          {view.alerts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Nothing waiting for review.</p> : (
            <ul className="mt-2 space-y-2">
              {view.alerts.map(({ evidence: e, reason }) => (
                <li key={e.id} className="text-xs">
                  <div className="font-medium text-foreground">{reason}</div>
                  <div className="text-muted-foreground">{e.vendor || "Unknown sender"} · {money(e.amount, e.currency)}</div>
                  <SourceLinks e={e} />
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-lg border border-border bg-muted/20 p-3" aria-labelledby="wk-due">
          <h3 id="wk-due" className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" aria-hidden /> Coming due — next 30 days ({view.comingDue.length})</h3>
          {view.comingDue.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No sourced renewal date in the next 30 days.</p> : (
            <ul className="mt-2 space-y-2">
              {view.comingDue.map((c, i) => (
                <li key={`${c.name}-${c.date}-${i}`} className="text-xs">
                  <div className="font-medium text-foreground">{c.date} · {c.name}</div>
                  <div className="text-muted-foreground">{c.basis === "explicit" ? "Date stated on a bill/email" : "Your estimate — not confirmed"} · {c.cost}</div>
                  {c.evidence ? <SourceLinks e={c.evidence} /> : <span className="text-muted-foreground">Source: {c.source || "your saved service list"}</span>}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
