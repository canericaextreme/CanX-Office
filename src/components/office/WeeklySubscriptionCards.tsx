import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, ChevronRight, CircleAlert, ExternalLink, FileText, Mail, ReceiptText, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchesArchiveContext, type ArchiveContext } from "@/components/office/SubscriptionEvidenceArchive";
import { StatusBadge } from "@/components/office/StatusBadge";
import { formatZoned, gmailLink, OFFICE_TIMEZONE, type LastCheck, type SubscriptionEvidence, type WeeklyView } from "@/lib/subscriptions";

const KIND: Record<SubscriptionEvidence["kind"], string> = {
  receipt: "Receipt evidence",
  "unpaid-invoice": "Invoice — amount due as stated",
  "renewal-notice": "Renewal notice",
  "deadline-notice": "Service or account deadline",
  promotion: "Promotion or offer",
  "price-change": "Price change notice",
  "failed-payment": "Failed / declined payment",
  unknown: "Unclassified",
};

function money(a: number | null, c: string | null) {
  return a === null ? "amount not stated" : `${a.toFixed(2)} ${c ?? "(currency not stated)"}`;
}

function evidenceLabel(e: SubscriptionEvidence) {
  if (e.kind === "receipt") return e.amount === null ? "Receipt email — amount not stated" : "Receipt email — amount stated";
  if (e.kind === "unpaid-invoice") return e.amount === null ? "Invoice — amount not stated" : KIND[e.kind];
  return KIND[e.kind];
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
        <span>
          Email evidence saved — needs review; not confirmed as a Finance receipt.{" "}
          <Link to="/finance" className="underline">Open Finance</Link>
        </span>
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

/** How many rows a long list shows before an explicit, labelled "Show all" button. */
export const LIST_PREVIEW = 5;

function ShowMore({ total, shown, open, onToggle, what }: { total: number; shown: number; open: boolean; onToggle: () => void; what: string }) {
  if (total <= LIST_PREVIEW) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Showing {shown} of {total} {what}.</span>
      <Button size="sm" variant="outline" className="min-h-9" aria-expanded={open} onClick={onToggle}>{open ? "Show fewer" : `Show all ${total}`}</Button>
    </div>
  );
}

type OpenArchive = (request: { context: ArchiveContext; reviewOnly: boolean }) => void;

const SUMMARY: Array<{ id: string; label: string; context: ArchiveContext; reviewOnly: boolean; Icon: typeof ReceiptText; tone: string; hint: string }> = [
  { id: "review", label: "Needs review", context: "all", reviewOnly: true, Icon: AlertTriangle, tone: "border-canx-yellow/50 bg-canx-yellow/10 text-canx-yellow", hint: "Waiting for your decision" },
  { id: "deadlines", label: "Deadlines & renewals", context: "deadlines", reviewOnly: false, Icon: CalendarClock, tone: "border-canx-blue/50 bg-canx-blue/10 text-canx-blue", hint: "Renewal, account and invoice dates" },
  { id: "receipts", label: "Receipts", context: "receipts", reviewOnly: false, Icon: ReceiptText, tone: "border-finance-teal/50 bg-finance-teal/10 text-finance-teal", hint: "Email evidence — not yet a Finance receipt" },
  { id: "invoices", label: "Invoices due", context: "invoices", reviewOnly: false, Icon: FileText, tone: "border-canx-yellow/40 bg-canx-yellow/5 text-canx-yellow", hint: "Amount due as the email states" },
  { id: "payment", label: "Payment issues", context: "payment-issues", reviewOnly: false, Icon: CircleAlert, tone: "border-destructive/40 bg-destructive/10 text-destructive", hint: "Failed payments and unpaid invoices" },
  { id: "promotions", label: "Promotions & offers", context: "promotions", reviewOnly: false, Icon: Tag, tone: "border-border bg-muted/30 text-muted-foreground", hint: "Never a bill or deadline" },
];

/** Compact top-of-room overview: last check, category cards that open the month archive, and urgent deadlines. */
export function SubscriptionOverview({ view, lastCheck, evidence, onOpenArchive }: { view: WeeklyView; lastCheck: LastCheck | null; evidence: SubscriptionEvidence[]; onOpenArchive?: OpenArchive }) {
  const [allDue, setAllDue] = useState(false);
  const count = (c: (typeof SUMMARY)[number]) => evidence.filter((e) => (!c.reviewOnly || e.review === "needs-review") && matchesArchiveContext(e, c.context)).length;
  const due = allDue ? view.comingDue : view.comingDue.slice(0, LIST_PREVIEW);
  return (
    <section aria-label="Subscriptions overview" className="space-y-3">
      <LastCheckSummary check={lastCheck} />
      <div>
        <h3 className="text-sm font-semibold">Saved billing evidence by category ({evidence.length})</h3>
        <p className="text-xs text-muted-foreground">Tap a card to open the month-by-month list below with that filter. Counts are saved billing evidence only, not the whole inbox. {view.week.label}: {view.emails.length} email(s), {view.alerts.length} item(s) waiting for review.</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUMMARY.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpenArchive?.({ context: c.context, reviewOnly: c.reviewOnly })}
              aria-label={`${c.label}: ${count(c)} — open in month list`}
              className={`group flex min-h-16 items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${c.tone}`}>
              <c.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-1"><span className="text-xs font-semibold text-foreground">{c.label}</span><span className="text-lg font-semibold">{count(c)}</span></span>
                <span className="block text-[11px] text-muted-foreground">{c.hint}</span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <article className="rounded-lg border border-border bg-muted/20 p-3" aria-labelledby="wk-due">
        <h3 id="wk-due" className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" aria-hidden /> Deadlines — overdue and next 30 days ({view.comingDue.length})</h3>
        {view.comingDue.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No sourced account, service, payment or renewal deadline is recorded.</p> : (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {due.map((c, i) => (
              <li key={`${c.name}-${c.date}-${i}`} className={`rounded-md border-l-4 p-2 text-xs ${c.daysAway < 0 ? "border-l-destructive bg-destructive/10" : "border-l-canx-yellow bg-canx-yellow/10"}`}>
                <div className="font-medium text-foreground">{c.date} · {c.name} · {c.daysAway < 0 ? `${Math.abs(c.daysAway)} day(s) overdue` : c.daysAway === 0 ? "Due today" : `${c.daysAway} day(s) left`}</div>
                <div className="text-muted-foreground">What: {c.what.replace("-", " ")} · {c.basis === "relative-to-received" ? `Calculated from source-email received time in ${OFFICE_TIMEZONE}` : c.basis === "explicit" ? "Date stated on a bill/email" : "Your estimate — not confirmed"}</div>
                <div className="text-muted-foreground">{c.action} · {c.confidence} · {c.cost}</div>
                {c.evidence ? <SourceLinks e={c.evidence} /> : <span className="text-muted-foreground">Source: {c.source || "your saved service list"}</span>}
              </li>
            ))}
          </ul>
        )}
        <ShowMore total={view.comingDue.length} shown={due.length} open={allDue} onToggle={() => setAllDue(!allDue)} what="deadlines (soonest first)" />
      </article>
    </section>
  );
}

/** This week's emails and the review alerts, folded away so they never bury the month controls. */
export function WeeklyEvidenceDetails({ view, onOpenArchive }: { view: WeeklyView; onOpenArchive?: OpenArchive }) {
  const [allEmails, setAllEmails] = useState(false);
  const [allAlerts, setAllAlerts] = useState(false);
  const emails = allEmails ? view.emails : view.emails.slice(0, LIST_PREVIEW);
  const alerts = allAlerts ? view.alerts : view.alerts.slice(0, LIST_PREVIEW);
  const summary = "flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden";
  return (
    <section aria-label="This week in subscriptions" className="grid gap-3 md:grid-cols-2">
      <details className="group rounded-lg border border-border bg-muted/20 p-3">
        <summary className={summary}><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /><Mail className="h-4 w-4" aria-hidden /> This week’s emails ({view.emails.length})</summary>
        <p className="mt-1 text-xs text-muted-foreground">{view.week.label}. Dates shown in {OFFICE_TIMEZONE} time.</p>
        {view.emails.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No subscription-related email recorded for this week.</p> : (
          <ul className="mt-2 space-y-2">
            {emails.map((e) => (
              <li key={e.id} className="text-xs">
                <div className="font-medium text-foreground">{evidenceLabel(e)} · {e.vendor || "Unknown sender"}</div>
                <div className="text-muted-foreground">Received {e.receivedAt ? formatZoned(e.receivedAt) : "time unknown"} · {money(e.amount, e.currency)}</div>
                <SourceLinks e={e} />
              </li>
            ))}
          </ul>
        )}
        <ShowMore total={view.emails.length} shown={emails.length} open={allEmails} onToggle={() => setAllEmails(!allEmails)} what="emails" />
        {view.emailsUnknownTime.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">{view.emailsUnknownTime.length} older saved item(s) have no recorded email received time, so they are not counted as this week’s mail. They are in the “Date not recorded” month group.</p>
        )}
      </details>
      <details className="group rounded-lg border border-border bg-muted/20 p-3">
        <summary className={summary}><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /><AlertTriangle className="h-4 w-4" aria-hidden /> Alerts waiting for review ({view.alerts.length})</summary>
        <p className="mt-1 text-xs text-muted-foreground">All saved evidence still marked Needs review, from any month.</p>
        {onOpenArchive && view.alerts.length > 0 ? (
          <Button size="sm" variant="outline" className="mt-2 min-h-9" onClick={() => onOpenArchive({ context: "all", reviewOnly: true })}>Review these by month</Button>
        ) : null}
        {view.alerts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Nothing waiting for review.</p> : (
          <ul className="mt-2 space-y-2">
            {alerts.map(({ evidence: e, reason }) => (
              <li key={e.id} className="text-xs">
                <div className="font-medium text-foreground">{reason}</div>
                <div className="text-muted-foreground">{e.vendor || "Unknown sender"} · {money(e.amount, e.currency)}</div>
                <SourceLinks e={e} />
              </li>
            ))}
          </ul>
        )}
        <ShowMore total={view.alerts.length} shown={alerts.length} open={allAlerts} onToggle={() => setAllAlerts(!allAlerts)} what="alerts" />
      </details>
    </section>
  );
}

/** Combined view kept for rendering tests; the room itself places these pieces separately. */
export function WeeklySubscriptionCards({ view, lastCheck, evidence = [] }: { view: WeeklyView; lastCheck: LastCheck | null; evidence?: SubscriptionEvidence[] }) {
  return (
    <div className="space-y-3">
      <SubscriptionOverview view={view} lastCheck={lastCheck} evidence={evidence} />
      <WeeklyEvidenceDetails view={view} />
    </div>
  );
}
