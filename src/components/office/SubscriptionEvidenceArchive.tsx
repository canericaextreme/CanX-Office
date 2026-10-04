import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CircleAlert, ExternalLink, FileText, MailQuestion, ReceiptText, TrendingUp } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

export function SubscriptionEvidenceArchive({ evidence, loading, onMark }: { evidence: SubscriptionEvidence[]; loading: boolean; onMark: (id: string, review: "reviewed" | "dismissed") => void }) {
  const allGroups = useMemo(() => evidenceMonthGroups(evidence), [evidence]);
  const [month, setMonth] = useState("all");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openMonths, setOpenMonths] = useState<string[]>(() => allGroups[0] ? [allGroups[0].key] : []);
  useEffect(() => {
    if (allGroups[0] && openMonths.length === 0) setOpenMonths([allGroups[0].key]);
  }, [allGroups, openMonths.length]);
  const groups = useMemo(() => allGroups
    .filter((group) => month === "all" || group.key === month)
    .map((group) => ({ ...group, items: reviewOnly ? group.items.filter((item) => item.review === "needs-review") : group.items }))
    .filter((group) => group.items.length > 0), [allGroups, month, reviewOnly]);
  const reviewCount = evidence.filter((item) => item.review === "needs-review").length;
  const chooseMonth = (value: string) => {
    setMonth(value);
    setOpenMonths(value === "all" ? (allGroups[0] ? [allGroups[0].key] : []) : [value]);
  };
  const toggleReview = () => {
    const next = !reviewOnly;
    setReviewOnly(next);
    if (next) {
      const firstReviewMonth = allGroups.find((group) => group.needsReview > 0);
      setOpenMonths(firstReviewMonth ? [firstReviewMonth.key] : []);
    } else {
      setOpenMonths(month === "all" ? (allGroups[0] ? [allGroups[0].key] : []) : [month]);
    }
  };

  return (
    <section aria-label="Billing evidence from email">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Billing evidence from email ({reviewCount} to review)</h3>
          <p className="text-xs text-muted-foreground">Organized by source-email month in {OFFICE_TIMEZONE}. Evidence never changes a confirmed cost or date. No tax or deductibility judgement is made.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium">
            <span className="block">Month</span>
            <Select value={month} onValueChange={chooseMonth}>
              <SelectTrigger className="w-52" aria-label="Filter evidence by month"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months ({evidence.length})</SelectItem>
                {allGroups.map((group) => <SelectItem key={group.key} value={group.key}>{group.label} ({group.items.length})</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button variant={reviewOnly ? "default" : "outline"} aria-pressed={reviewOnly} onClick={toggleReview}>
            <AlertTriangle className="h-4 w-4" aria-hidden /> Needs review ({reviewCount})
          </Button>
        </div>
      </div>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading your saved mail choices…</p> : evidence.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No active evidence recorded. Ignored emails remain available in Saved mail review.</p> : groups.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No evidence matches these filters.</p> : (
        <Accordion type="multiple" value={openMonths} onValueChange={setOpenMonths} className="mt-3 space-y-2">
          {groups.map((group) => (
            <AccordionItem key={group.key} value={group.key} className="rounded-md border border-border/60 px-3">
              <AccordionTrigger className="gap-3 no-underline hover:no-underline">
                <span>{group.label}</span>
                <span className="ml-auto mr-2 text-xs text-muted-foreground">{group.items.length} item(s) · {group.needsReview} need review</span>
              </AccordionTrigger>
              <AccordionContent>
                {group.dateBasis === "evidence-date" ? <p className="mb-2 text-xs text-muted-foreground">Grouped by explicitly recorded evidence date because source-email received times are unavailable.</p> : null}
                <ul className="space-y-2">{group.items.map((item) => <EvidenceItem key={item.id} evidence={item} onMark={onMark} />)}</ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}