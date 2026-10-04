import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CalendarClock, ChevronRight, CircleAlert, ExternalLink, FileText, MailQuestion, ReceiptText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evidenceDate, evidenceMonthGroups, formatZoned, gmailLink, OFFICE_TIMEZONE, type SubscriptionEvidence } from "@/lib/subscriptions";

const LABELS: Record<SubscriptionEvidence["kind"], string> = {
  receipt: "Receipt evidence",
  "unpaid-invoice": "Invoice — amount due as stated",
  "renewal-notice": "Renewal notice",
  "deadline-notice": "Service or account deadline",
  promotion: "Promotion or offer",
  "price-change": "Price change notice",
  "failed-payment": "Failed or declined payment",
  unknown: "Unclassified evidence",
};

const MATCH_LABEL: Record<SubscriptionEvidence["matchStatus"], string> = {
  matched: "Matched office service",
  unknown: "Unknown sender",
  conflict: "Several possible services",
  personal: "Marked personal — not filed",
  "unverified-sender": "Sender not yet verified",
};

const TONES: Record<SubscriptionEvidence["kind"], { border: string; icon: string; Icon: typeof ReceiptText }> = {
  receipt: { border: "border-l-finance-teal", icon: "bg-finance-teal/15 text-finance-teal", Icon: ReceiptText },
  "unpaid-invoice": { border: "border-l-canx-yellow", icon: "bg-canx-yellow/15 text-canx-yellow", Icon: FileText },
  "renewal-notice": { border: "border-l-canx-blue", icon: "bg-canx-blue/15 text-canx-blue", Icon: CalendarClock },
  "deadline-notice": { border: "border-l-canx-yellow", icon: "bg-canx-yellow/15 text-canx-yellow", Icon: CalendarClock },
  promotion: { border: "border-l-finance-teal", icon: "bg-finance-teal/15 text-finance-teal", Icon: TrendingUp },
  "price-change": { border: "border-l-finance-teal", icon: "bg-finance-teal/15 text-finance-teal", Icon: TrendingUp },
  "failed-payment": { border: "border-l-destructive", icon: "bg-destructive/15 text-destructive", Icon: CircleAlert },
  unknown: { border: "border-l-border", icon: "bg-muted text-muted-foreground", Icon: MailQuestion },
};

const money = (amount: number | null, currency: string | null) =>
  amount === null ? "Amount not stated" : `${amount.toFixed(2)} ${currency ?? "(currency not stated)"}`;

function EvidenceLinks({ evidence }: { evidence: SubscriptionEvidence }) {
  const emailUrl = gmailLink(evidence.mailbox, evidence.messageId);
  const receiptLike = evidence.kind === "receipt" || evidence.kind === "unpaid-invoice";
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
      {emailUrl ? (
        <a href={emailUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
          Source email <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : <span>Source email link not available</span>}
      {receiptLike && evidence.matchStatus !== "personal" ? (
        <span>Email evidence saved — needs review; not confirmed as a Finance receipt. <Link to="/finance" className="underline">Open Finance</Link></span>
      ) : <Link to="/finance" className="underline">Open Finance</Link>}
    </div>
  );
}

function EvidenceItem({ evidence, onMark }: { evidence: SubscriptionEvidence; onMark: (id: string, review: "reviewed" | "dismissed") => void }) {
  const tone = TONES[evidence.kind];
  const Icon = tone.Icon;
  const date = evidenceDate(evidence);
  const dateLabel = date.basis === "source-email"
    ? `Source email received ${formatZoned(evidence.receivedAt ?? "")} (${OFFICE_TIMEZONE})`
    : date.basis === "evidence-date"
      ? `Evidence date ${date.day} — source email received time not recorded`
      : "Date not recorded";
  return (
    <li className={`rounded-md border border-border/60 border-l-4 ${tone.border} bg-muted/15 p-3 text-xs`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`mt-0.5 rounded-md p-1.5 ${tone.icon}`}><Icon className="h-4 w-4" aria-hidden /></span>
          <div>
            <div className="font-medium text-foreground">{LABELS[evidence.kind]} · {evidence.vendor || "Unknown sender"}</div>
            <div className="text-muted-foreground">{money(evidence.amount, evidence.currency)} · {dateLabel}</div>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 font-medium ${evidence.kind === "failed-payment" ? "border-destructive/40 bg-destructive/10 text-destructive" : evidence.review === "needs-review" ? "border-canx-yellow/50 bg-canx-yellow/10 text-canx-yellow" : "border-finance-teal/40 bg-finance-teal/10 text-finance-teal"}`}>
          {evidence.kind === "failed-payment" ? "Payment issue" : evidence.review === "needs-review" ? "Needs review" : MATCH_LABEL[evidence.matchStatus]}
        </span>
      </div>
      <div className="mt-1 text-muted-foreground">Document date: {evidence.documentDate || "not stated"} · Renewal: {evidence.renewalDate ? `${evidence.renewalDate} (stated)` : "not stated"}</div>
      {evidence.classificationReason ? <div className="text-muted-foreground">Classification: {evidence.classificationReason}</div> : null}
      {evidence.deadlineWhat && evidence.deadlineWhat !== "unknown" ? <div className="text-muted-foreground">What expires or is due: {evidence.deadlineWhat.replace("-", " ")} · Deadline: {evidence.deadlineDate || "not recorded — review source email"}</div> : null}
      <div className="text-muted-foreground">Source: {evidence.mailbox || "linked mailbox"} · message {evidence.messageId.slice(0, 12)} · {MATCH_LABEL[evidence.matchStatus]}</div>
      <EvidenceLinks evidence={evidence} />
      {evidence.review === "needs-review" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onMark(evidence.id, "reviewed")}>Mark reviewed</Button>
          <Button size="sm" variant="ghost" onClick={() => onMark(evidence.id, "dismissed")}>Dismiss</Button>
        </div>
      ) : null}
    </li>
  );
}

export type ArchiveContext = "all" | "receipts" | "invoices" | "deadlines" | "promotions" | "payment-issues";

/** One shared definition so the summary cards and the archive filter always count the same items. */
export function matchesArchiveContext(item: SubscriptionEvidence, context: ArchiveContext): boolean {
  if (context === "receipts") return item.kind === "receipt";
  if (context === "invoices") return item.kind === "unpaid-invoice";
  if (context === "deadlines") return item.kind === "deadline-notice" || item.kind === "renewal-notice" || item.kind === "unpaid-invoice";
  if (context === "promotions") return item.kind === "promotion";
  if (context === "payment-issues") return item.kind === "failed-payment" || item.kind === "unpaid-invoice";
  return true;
}

/** Which focused list is open: one month (or every month) with a type and review filter. */
export interface ArchiveView { month: string; context: ArchiveContext; reviewOnly: boolean }

export const ARCHIVE_ID = "subscription-evidence-archive";
/** Hub shows at most this many month cards; older months go in a chooser, never a giant grid. */
export const HUB_MONTH_CARDS = 6;
/** Focused list page size; "Show more" reveals the next page with a genuine count. */
export const FOCUS_PAGE = 20;

function TypeFilter({ value, onChange }: { value: ArchiveContext; onChange: (v: ArchiveContext) => void }) {
  return (
    <label className="space-y-1 text-xs font-medium">
      <span className="block">Evidence type</span>
      <Select value={value} onValueChange={(v) => onChange(v as ArchiveContext)}>
        <SelectTrigger className="w-52" aria-label="Filter evidence by type"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All evidence</SelectItem>
          <SelectItem value="receipts">Receipts</SelectItem>
          <SelectItem value="invoices">Invoices due</SelectItem>
          <SelectItem value="deadlines">Deadlines and renewals</SelectItem>
          <SelectItem value="promotions">Promotions and offers</SelectItem>
          <SelectItem value="payment-issues">Payment issues</SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
}

/** Compact hub: month cards only. No email rows are rendered here. */
export function EvidenceMonthCards({ evidence, loading, onOpen }: { evidence: SubscriptionEvidence[]; loading: boolean; onOpen: (view: ArchiveView) => void }) {
  const groups = useMemo(() => evidenceMonthGroups(evidence), [evidence]);
  const reviewCount = evidence.filter((item) => item.review === "needs-review").length;
  const shown = groups.slice(0, HUB_MONTH_CARDS);
  const older = groups.slice(HUB_MONTH_CARDS);
  return (
    <section id={ARCHIVE_ID} aria-label="Billing evidence by month" className="scroll-mt-4 rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Billing evidence by month</h3>
          <p className="text-xs text-muted-foreground">{evidence.length} saved email item(s), grouped by source-email month in {OFFICE_TIMEZONE}. Tap a month to open it. These are email evidence counts, not money totals.</p>
        </div>
        <Button variant="outline" className="min-h-10" disabled={reviewCount === 0} onClick={() => onOpen({ month: "all", context: "all", reviewOnly: true })}>
          <AlertTriangle className="h-4 w-4" aria-hidden /> Needs review ({reviewCount})
        </Button>
      </div>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading your saved mail choices…</p> : groups.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No active evidence recorded. Ignored emails remain available in Saved mail review.</p> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((group) => (
              <button key={group.key} type="button" onClick={() => onOpen({ month: group.key, context: "all", reviewOnly: false })}
                aria-label={`${group.label}: ${group.items.length} item(s), ${group.needsReview} need review — open month`}
                className={`flex min-h-20 flex-col justify-between rounded-lg border border-border/60 border-l-4 p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${group.key === "not-recorded" ? "border-l-border" : group.needsReview > 0 ? "border-l-canx-yellow" : "border-l-finance-teal"}`}>
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">{group.label}<ChevronRight className="h-4 w-4 opacity-60" aria-hidden /></span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
                  <span className="text-muted-foreground">{group.items.length} item(s)</span>
                  <span className={group.needsReview > 0 ? "font-medium text-canx-yellow" : "text-muted-foreground"}>{group.needsReview} need review</span>
                </span>
              </button>
            ))}
          </div>
          {older.length > 0 ? (
            <label className="mt-3 block space-y-1 text-xs font-medium">
              <span className="block">Older months ({older.length})</span>
              <Select value="" onValueChange={(key) => onOpen({ month: key, context: "all", reviewOnly: false })}>
                <SelectTrigger className="w-60" aria-label="Open an older month"><SelectValue placeholder="Choose an older month" /></SelectTrigger>
                <SelectContent>{older.map((g) => <SelectItem key={g.key} value={g.key}>{g.label} ({g.items.length} · {g.needsReview} to review)</SelectItem>)}</SelectContent>
              </Select>
            </label>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Focused view of one month (or every month for a filter), paged with genuine counts. */
export function EvidenceFocusView({ evidence, view, onView, onBack, onMark }: { evidence: SubscriptionEvidence[]; view: ArchiveView; onView: (view: ArchiveView) => void; onBack: () => void; onMark: (id: string, review: "reviewed" | "dismissed") => void }) {
  const groups = useMemo(() => evidenceMonthGroups(evidence), [evidence]);
  const group = view.month === "all" ? null : groups.find((g) => g.key === view.month) ?? null;
  const source = view.month === "all" ? groups.flatMap((g) => g.items) : group?.items ?? [];
  const items = source.filter((item) => (!view.reviewOnly || item.review === "needs-review") && matchesArchiveContext(item, view.context));
  const reviewInScope = source.filter((item) => item.review === "needs-review").length;
  const [limit, setLimit] = useState(FOCUS_PAGE);
  useEffect(() => setLimit(FOCUS_PAGE), [view.month, view.context, view.reviewOnly]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: false }); }, [view.month]);
  const title = view.month === "all" ? "All months" : group?.label ?? "Month not found";
  const visible = items.slice(0, limit);
  return (
    <section id={ARCHIVE_ID} aria-label="Billing evidence from email" className="scroll-mt-4 space-y-3 rounded-lg border border-border bg-muted/10 p-3">
      <Button variant="outline" className="min-h-10" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to Subscriptions</Button>
      <div>
        <h3 ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">{title}{view.reviewOnly ? " — needs review" : ""}</h3>
        <p className="text-xs text-muted-foreground">{source.length} item(s) in this {view.month === "all" ? "archive" : "month"} · {reviewInScope} need review. Dates from source-email received time in {OFFICE_TIMEZONE}. Evidence never changes a confirmed cost or date; no tax judgement is made.</p>
        {group?.dateBasis === "evidence-date" ? <p className="text-xs text-muted-foreground">Grouped by explicitly recorded evidence date because source-email received times are unavailable.</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs font-medium">
          <span className="block">Month</span>
          <Select value={view.month} onValueChange={(month) => onView({ ...view, month })}>
            <SelectTrigger className="w-52" aria-label="Filter evidence by month"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months ({evidence.length})</SelectItem>
              {groups.map((g) => <SelectItem key={g.key} value={g.key}>{g.label} ({g.items.length})</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <TypeFilter value={view.context} onChange={(context) => onView({ ...view, context })} />
        <Button variant={view.reviewOnly ? "default" : "outline"} className="min-h-10" aria-pressed={view.reviewOnly} onClick={() => onView({ ...view, reviewOnly: !view.reviewOnly })}>
          <AlertTriangle className="h-4 w-4" aria-hidden /> Needs review ({reviewInScope})
        </Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No evidence matches these filters.</p> : (
        <>
          <ul className="space-y-2">{visible.map((item) => <EvidenceItem key={item.id} evidence={item} onMark={onMark} />)}</ul>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Showing {visible.length} of {items.length}.</span>
            {visible.length < items.length ? <Button size="sm" variant="outline" className="min-h-9" onClick={() => setLimit(limit + FOCUS_PAGE)}>Show {Math.min(FOCUS_PAGE, items.length - visible.length)} more</Button> : null}
          </div>
        </>
      )}
      <Button variant="ghost" className="min-h-10" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden /> Back to Subscriptions</Button>
    </section>
  );
}

/** Self-contained hub + focused view (used by tests and anywhere without page-level state). */
export function SubscriptionEvidenceArchive({ evidence, loading, onMark }: { evidence: SubscriptionEvidence[]; loading: boolean; onMark: (id: string, review: "reviewed" | "dismissed") => void }) {
  const [view, setView] = useState<ArchiveView | null>(null);
  return view
    ? <EvidenceFocusView evidence={evidence} view={view} onView={setView} onBack={() => setView(null)} onMark={onMark} />
    : <EvidenceMonthCards evidence={evidence} loading={loading} onOpen={setView} />;
}
