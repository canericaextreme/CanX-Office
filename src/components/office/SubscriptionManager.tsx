import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, ChevronRight, ExternalLink, ListChecks, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useOwnerSession } from "@/lib/owner-session";
import {
  STARTER_SUBSCRIPTIONS,
  cleanWebsiteUrl,
  suggestedStarters,
  priceChangeFlags,
  renewalWarnings,
  weeklyView,
  formatZoned,
  gmailLink,
  serviceBillingCounts,
  serviceBillingDisplay,
  type LastCheck,
  type SubscriptionEvidence,
  type SubscriptionRecord,
} from "@/lib/subscriptions";
import { CheckEmailsNow } from "@/components/office/CheckEmailsNow";
import { SubscriptionOverview } from "@/components/office/WeeklySubscriptionCards";
import { EvidenceFocusView, EvidenceMonthCards, type ArchiveContext, type ArchiveView } from "@/components/office/SubscriptionEvidenceArchive";
import { MailReviewPanel, useMailPreferences } from "@/components/office/MailReviewPanel";
import { visibleEvidence } from "@/lib/mail-preferences";
import { listSubscriptions, reviewRoutineSubscriptionEvidence, reviewSubscriptionEvidence, saveSubscriptionList, type ElsieReviewResult } from "@/lib/subscriptions.functions";
import type { GmailScanConfig } from "@/lib/gmail-scan-window";

const money = (amount: number | null, currency: string | null) =>
  amount === null ? "Unknown" : `${amount.toFixed(2)} ${currency ?? "(currency not stated)"}`;

export function SubscriptionManager() {
  const owner = useOwnerSession();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);
  const [evidence, setEvidence] = useState<SubscriptionEvidence[]>([]);
  const [editing, setEditing] = useState<SubscriptionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCheck, setLastCheck] = useState<LastCheck | null>(null);
  const [scanConfig, setScanConfig] = useState<GmailScanConfig | null>(null);
  // When set, the room shows only the focused month/filter view, replacing the hub.
  const [focus, setFocus] = useState<ArchiveView | null>(null);
  const [serviceFocus, setServiceFocus] = useState<string | null>(null);
  const [elsieReview, setElsieReview] = useState<ElsieReviewResult | null>(null);
  const openArchive = useCallback((req: { context: ArchiveContext; reviewOnly: boolean }) => {
    setFocus({ month: "all", ...req });
  }, []);
  const openFocus = useCallback((view: ArchiveView) => {
    setFocus(view);
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0 });
  }, []);

  const load = useCallback(() => {
    if (!owner.shared || !owner.accessToken) { setState("idle"); return; }
    setState("loading");
    listSubscriptions({ data: { accessToken: owner.accessToken } })
      .then((res) => {
        if (!res.ok || !res.data) { setState("error"); setMessage(res.message); return; }
        setSaved(res.data.saved);
        setSubs(res.data.saved ? res.data.subscriptions : STARTER_SUBSCRIPTIONS);
        setEvidence(res.data.evidence);
        setLastCheck(res.data.lastCheck ?? null);
        setScanConfig(res.data.scanConfig ?? null);
        setState("ready");
      })
      .catch(() => { setState("error"); setMessage("Subscriptions could not be read."); });
  }, [owner.shared, owner.accessToken]);
  useEffect(load, [load]);

  const [prefsLoad, setPrefsLoad] = useMailPreferences(owner.accessToken ?? null);
  // Ignored emails are hidden from every main view once saved choices are loaded.
  // While loading, email-derived views stay empty (no flash); on a read failure all
  // mail is shown with a warning rather than pretending anything is hidden.
  const shownEvidence = useMemo(
    () => prefsLoad.state === "ready" ? visibleEvidence(evidence, prefsLoad.prefs) : prefsLoad.state === "loading" ? [] : evidence,
    [evidence, prefsLoad],
  );
  const warnings = useMemo(() => renewalWarnings(saved ? subs : [], shownEvidence), [subs, shownEvidence, saved]);
  const flags = useMemo(() => priceChangeFlags(saved ? subs : [], shownEvidence), [subs, shownEvidence, saved]);
  const weekly = useMemo(() => weeklyView(saved ? subs : [], shownEvidence), [subs, shownEvidence, saved]);
  const review = shownEvidence.filter((e) => e.review === "needs-review");
  const focusedService = serviceFocus ? subs.find((s) => s.id === serviceFocus) ?? null : null;
  const serviceEvidence = focusedService
    ? shownEvidence.filter((item) => item.subscriptionId === focusedService.id && item.statedTerms).slice().sort((a, b) => (b.receivedAt ?? b.recordedAt).localeCompare(a.receivedAt ?? a.recordedAt))
    : [];
  const focusedBilling = focusedService ? serviceBillingDisplay(focusedService, shownEvidence) : null;

  async function persist(next: SubscriptionRecord[]) {
    if (!owner.accessToken) return;
    setBusy(true);
    const res = await saveSubscriptionList({ data: { accessToken: owner.accessToken, subscriptions: next } }).catch(() => null);
    setBusy(false);
    setMessage(res?.message ?? "The save could not be verified.");
    if (res?.ok) { setEditing(null); load(); }
  }

  async function mark(id: string, review: "reviewed" | "dismissed") {
    if (!owner.accessToken) return;
    const res = await reviewSubscriptionEvidence({ data: { accessToken: owner.accessToken, id, review } }).catch(() => null);
    setMessage(res?.message ?? "The change could not be verified.");
    if (res?.ok) load();
  }

  async function runElsieReview() {
    if (!owner.accessToken || busy) return;
    setBusy(true);
    const res = await reviewRoutineSubscriptionEvidence({ data: { accessToken: owner.accessToken } }).catch(() => null);
    setBusy(false);
    const result = res ?? { ok: false, message: "The routine review could not be verified.", reviewed: 0, alreadyReviewed: 0, leftForJohn: 0, items: [] };
    setElsieReview(result);
    setMessage(result.message);
    if (result.ok) load();
  }

  if (state !== "idle" && focus) {
    return (
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-base">Office subscriptions</CardTitle></CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {message && state === "ready" && <p className="text-xs text-muted-foreground">{message}</p>}
          <EvidenceFocusView evidence={shownEvidence} view={focus} onView={setFocus} onBack={() => setFocus(null)} onMark={mark} />
        </CardContent>
      </Card>
    );
  }

  if (state === "ready" && focusedService && focusedBilling) {
    return (
      <Card className="border-border bg-card">
        <CardHeader><CardTitle className="text-base">Office subscriptions</CardTitle></CardHeader>
        <CardContent className="space-y-4" aria-live="polite">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setServiceFocus(null); }}><ArrowLeft className="h-4 w-4" />Back to Subscriptions</Button>
          <section aria-label={`${focusedService.name} subscription details`} className="space-y-4 rounded-md border border-canx-blue/40 bg-canx-blue/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{focusedService.name}</h2>
                <p className="text-sm text-muted-foreground">{focusedBilling.planName} · {focusedService.scope === "office" ? "Office" : focusedService.scope === "personal" ? "Personal" : "Scope unknown"}</p>
              </div>
              <p className="text-xl font-semibold text-canx-green">{focusedBilling.rate} · {focusedBilling.recurrenceLabel}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Owner-confirmed billing cycle" value={focusedService.cadence === "unknown" ? "Unknown" : focusedService.cadence} />
              <Detail label="Recurring schedule" value={`${focusedBilling.recurrenceLabel} · ${focusedBilling.recurrenceSource}`} />
              <Detail label="Auto-renew" value={`${focusedBilling.autoRenew === "enabled" ? "Enabled" : focusedBilling.autoRenew === "disabled" ? "Disabled" : "Not recorded"} · ${focusedBilling.autoRenewSource}`} />
              <Detail label="Confirmed rate source" value={focusedService.knownCost ? `${focusedService.knownCost.source}${focusedService.knownCost.asOf ? ` · ${focusedService.knownCost.asOf}` : " · date not recorded"}` : "Not recorded"} />
              <Detail label="Next renewal" value={focusedService.nextRenewal ? `${focusedService.nextRenewal.date} · ${focusedService.nextRenewal.basis} · ${focusedService.nextRenewal.source}` : "Unknown"} />
              <Detail label="Usage and top-ups" value="Separate from the confirmed fixed rate and Finance paid totals" />
            </dl>
            {focusedService.websiteUrl && (
              <a className="inline-flex min-h-11 items-center gap-1 rounded-md border border-canx-blue/60 px-3 text-sm font-medium text-canx-blue underline underline-offset-2" href={focusedService.websiteUrl} target="_blank" rel="noreferrer" aria-label={`Open the ${focusedService.name} website in a new tab`}>Open website<ExternalLink className="h-4 w-4" /></a>
            )}
            <div className="flex gap-2">
              {editing?.id === focusedService.id
                ? <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close editor</Button>
                : <Button size="sm" variant="outline" onClick={() => setEditing(subs.find((s) => s.id === focusedService.id) ?? null)}><Pencil className="h-4 w-4" />Edit {focusedService.name}</Button>}
              <Button size="sm" variant="ghost" aria-label={`Remove ${focusedService.name}`} disabled={busy} onClick={() => persist(subs.filter((x) => x.id !== focusedService.id))}><Trash2 className="h-4 w-4" />Remove</Button>
            </div>
          </section>
          <section aria-labelledby="email-stated-terms" className="space-y-2">
            <div>
              <h3 id="email-stated-terms" className="text-sm font-semibold">Email-stated plan and rate</h3>
              <p className="text-xs text-muted-foreground">Source evidence only. It does not replace owner-confirmed settings or prove payment.</p>
            </div>
            {serviceEvidence.length === 0 ? <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">No unambiguous recurring plan terms have been extracted from readable email yet.</p> : (
              <ul className="space-y-2">
                {serviceEvidence.slice(0, 5).map((item) => {
                  const stated = item.statedTerms;
                  if (!stated) return null;
                  const link = gmailLink(item.mailbox, item.messageId);
                  return <li key={item.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="font-medium">Email states: {stated.planName || "Plan unknown"} · {stated.recurringAmount !== null && stated.currency ? `${stated.currency} $${stated.recurringAmount.toFixed(2)}` : "Rate unknown"}{stated.interval ? ` / ${stated.interval === "monthly" ? "month" : "year"}` : ""} · {stated.recurrenceStatus === "recurring" ? "Recurring" : stated.recurrenceStatus === "not-recurring" ? "Not recurring" : stated.recurrenceStatus === "usage-based" ? "Usage-based" : "Recurring status unconfirmed"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{stated.product.replaceAll("-", " ")} · {stated.effectiveDate || "billing/effective date not stated"} · {stated.reason}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Received {item.receivedAt ? formatZoned(item.receivedAt) : "Not recorded"} · {item.mailbox || "mailbox not recorded"}</div>
                    {link && <a className="mt-2 inline-flex items-center gap-1 text-xs text-canx-blue underline" href={link} target="_blank" rel="noreferrer">Open source email<ExternalLink className="h-3 w-3" /></a>}
                  </li>;
                })}
              </ul>
            )}
          </section>
          {editing && editing.id === focusedService.id && <SubscriptionEditor key={editing.id} value={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(rec) => persist(subs.map((s) => s.id === focusedService.id ? { ...rec, id: focusedService.id } : s))} />}
        </CardContent>
      </Card>
    );
  }

  if (state === "idle") {
    return (
      <Card className="border-border bg-card"><CardContent className="p-4 text-sm text-muted-foreground">
        Sign in as owner with two-step verification to see and edit office subscriptions.
      </CardContent></Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Office subscriptions</CardTitle>
        <StatusBadge tone={saved ? "green" : "yellow"} label={saved ? "Saved in CanX account" : "Starter list — not saved"} />
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        <CheckEmailsNow accessToken={owner.accessToken ?? null} onVerified={load} savedScan={scanConfig} />
        <section aria-label="Elsie routine subscription review" className="rounded-md border border-finance-teal/40 bg-finance-teal/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold">Elsie review</h3><p className="text-xs text-muted-foreground">Marks only routine, confidently understood email evidence reviewed. It never means paid, filed, ignored or owner-confirmed.</p></div>
            <Button size="sm" variant="outline" disabled={busy || state !== "ready"} onClick={runElsieReview}><ListChecks className="h-4 w-4" />Review routine emails</Button>
          </div>
          {elsieReview ? <div className="mt-2 text-xs" role="status">
            <p>{elsieReview.message}</p>
            {elsieReview.items.length > 0 ? <details className="mt-2"><summary className="cursor-pointer font-medium">See {elsieReview.items.length} reviewed item(s) and reasons</summary><ul className="mt-2 max-h-56 space-y-2 overflow-auto">{elsieReview.items.map((item) => <li key={item.id}><span className="font-medium">{item.vendor}</span> · {item.reason}<span className="block text-muted-foreground">Source: {item.mailbox || "mailbox not recorded"} · {item.receivedAt ? formatZoned(item.receivedAt) : "date not recorded"}</span></li>)}</ul></details> : null}
          </div> : null}
        </section>
        {state === "loading" && <p className="text-sm text-muted-foreground">Loading subscriptions…</p>}
        {state === "error" && <p className="text-sm text-destructive">{message || "Subscriptions could not be read."}</p>}
        {message && state === "ready" && <p className="text-xs text-muted-foreground">{message}</p>}

        <SubscriptionOverview view={weekly} lastCheck={lastCheck} evidence={shownEvidence} onOpenArchive={openArchive} />

        {warnings.length > 0 && (
          <section aria-label="Renewals in the next seven days" className="rounded-md border border-canx-yellow/60 bg-canx-yellow/10 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" aria-hidden />Renewing within 7 days</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {warnings.map((w) => (
                <li key={`${w.name}-${w.date}`}>{w.name}: {w.date} ({w.daysAway === 0 ? "today" : `in ${w.daysAway} day(s)`}) — {w.basis === "explicit" ? "date stated in source" : "estimated by John"}; source: {w.source}</li>
              ))}
            </ul>
          </section>
        )}

        {flags.length > 0 && (
          <section aria-label="Possible price changes" className="rounded-md border border-destructive/60 bg-destructive/10 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />Possible price change — review</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {flags.map((f) => (
                <li key={f.evidenceId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{f.name}: confirmed {money(f.confirmed.amount, f.confirmed.currency)}, email shows {money(f.seen.amount, f.seen.currency)}. Confirmed cost not changed.</span>
                  <Button size="sm" variant="outline" onClick={() => mark(f.evidenceId, "reviewed")}>Mark reviewed</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <EvidenceMonthCards evidence={shownEvidence} loading={prefsLoad.state === "loading"} onOpen={openFocus} />

        {state === "ready" && <ServiceSummary subscriptions={subs} evidence={shownEvidence} />}
        {state === "ready" && (
          <ServiceCards subscriptions={subs} evidence={shownEvidence} onOpen={(id) => { setEditing(null); setServiceFocus(id); window.scrollTo?.({ top: 0 }); }} />
        )}

        {state === "ready" && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...STARTER_SUBSCRIPTIONS[0]!, id: "", name: "", aliases: [], senderDomains: [], notes: "", scope: "unknown" })}><Plus className="mr-1 h-4 w-4" />Add service</Button>
            {!saved && <Button size="sm" disabled={busy} onClick={() => persist(subs)}><Save className="mr-1 h-4 w-4" />Save this list to the CanX account</Button>}
          </div>
        )}

        {state === "ready" && saved && !editing && suggestedStarters(subs).length > 0 && (
          <section aria-label="Suggested services" className="rounded-md border border-border/50 p-3">
            <h3 className="text-sm font-semibold">Suggested services not in your list</h3>
            <p className="text-xs text-muted-foreground">Nothing is added unless you press Add. Cost, cadence and renewal stay unknown until you confirm them.</p>
            <ul className="mt-2 space-y-2">
              {suggestedStarters(subs).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{s.name}<span className="block text-xs text-muted-foreground">{s.notes}</span></span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => persist([...subs, s])}><Plus className="mr-1 h-4 w-4" />Add {s.name}</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editing && !serviceFocus && <SubscriptionEditor key={editing.id || "new-service"} value={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(rec) => {
          const exists = rec.id && subs.some((s) => s.id === rec.id);
          persist(exists ? subs.map((s) => (s.id === rec.id ? rec : s)) : [...subs, rec]);
        }} />}

        <details className="group rounded-lg border border-border bg-muted/10 p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /> Saved mail review and Ignore rules ({evidence.length} saved email(s))
          </summary>
          <div className="mt-2">
            <MailReviewPanel accessToken={owner.accessToken ?? null} evidence={evidence} prefs={prefsLoad} onPrefs={(p) => setPrefsLoad({ state: "ready", prefs: p })} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function SubscriptionEditor({ value, busy, onSave, onCancel }: { value: SubscriptionRecord; busy: boolean; onSave: (r: SubscriptionRecord) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: value.name,
    planName: value.planName ?? "",
    aliases: value.aliases.join(", "),
    domains: value.senderDomains.join(", "),
    scope: value.scope,
    cadence: value.cadence,
    recurrenceStatus: value.recurrenceStatus ?? "unknown",
    autoRenewStatus: value.autoRenewStatus ?? "unknown",
    amount: value.knownCost ? String(value.knownCost.amount) : "",
    currency: value.knownCost?.currency ?? "",
    renewal: value.nextRenewal?.date ?? "",
    basis: value.nextRenewal?.basis ?? "estimated",
    notes: value.notes,
    website: value.websiteUrl ?? "",
  });
  const [urlError, setUrlError] = useState("");
  const [amountError, setAmountError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); if (k === "website") setUrlError(""); if (k === "amount") setAmountError(""); };
  // Free-text entry so "224." and "0.05" can be typed naturally; validated on save.
  const amountText = f.amount.trim();
  const amount = amountText === "" ? null : /^\d+(\.\d{1,2})?$/.test(amountText) ? Number(amountText) : null;
  const field = "space-y-1 text-xs";
  const select = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <form aria-label={value.id ? `Edit ${value.name}` : "Add a service"} data-service-id={value.id || "new"} className="grid gap-3 rounded-md border-2 border-canx-blue/60 p-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const websiteUrl = cleanWebsiteUrl(f.website);
      if (f.website.trim() && !websiteUrl) {
        setUrlError("Enter a full web address starting with http:// or https://, or leave it blank.");
        return;
      }
      if (amountText !== "" && amount === null) {
        setAmountError("Enter a valid amount with up to 2 decimal places (e.g. 224.50), or leave it blank.");
        return;
      }
      // Saving a valid cost + currency IS the owner's confirmation — no separate
      // control. An unchanged cost keeps its original confirmation date; a new or
      // changed cost is dated today. Unknown costs and email-extracted terms are
      // never confirmed by saving unrelated fields.
      const unchanged = Boolean(value.knownCost && amount !== null && value.knownCost.amount === amount && value.knownCost.currency === f.currency.toUpperCase());
      const cost = amount !== null && Number.isFinite(amount) && /^[A-Za-z]{3}$/.test(f.currency)
        ? { amount, currency: f.currency.toUpperCase(), asOf: unchanged ? value.knownCost!.asOf : new Date().toISOString().slice(0, 10), source: "John" } : null;
      // A changed confirmed cost moves the old one into dated history; nothing is lost.
      const history = value.knownCost && (!cost || cost.amount !== value.knownCost.amount || cost.currency !== value.knownCost.currency)
        ? [...value.history, { date: value.knownCost.asOf || new Date().toISOString().slice(0, 10), amount: value.knownCost.amount, currency: value.knownCost.currency, source: value.knownCost.source }]
        : value.history;
      onSave({
        ...value,
        id: value.id || `s-${Date.now().toString(36)}`,
        name: f.name.trim(),
        planName: f.planName.trim(),
        aliases: f.aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
        senderDomains: f.domains.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
        scope: f.scope,
        cadence: f.cadence,
        recurrenceStatus: f.recurrenceStatus,
        recurrenceSource: f.recurrenceStatus === "unknown" ? "" : "John",
        autoRenewStatus: f.autoRenewStatus,
        autoRenewSource: f.autoRenewStatus === "unknown" ? "" : "John",
        knownCost: cost,
        nextRenewal: f.renewal ? { date: f.renewal, basis: f.basis as "explicit" | "estimated", source: "John" } : null,
        history,
        notes: f.notes,
        websiteUrl,
      });
    }}>
      <h3 className="text-sm font-semibold sm:col-span-2">{value.id ? `Editing: ${value.name}` : "Adding a new service"}</h3>
      <label className={field}>Service name<Input required value={f.name} onChange={set("name")} /></label>
      <label className={field}>Plan name (optional)<Input value={f.planName} onChange={set("planName")} placeholder="Only when known" /></label>
      <label className={field}>Scope<select className={select} value={f.scope} onChange={set("scope")}><option value="office">Office</option><option value="personal">Personal</option><option value="unknown">Unknown</option></select></label>
      <label className={field}>Other names (comma separated)<Input value={f.aliases} onChange={set("aliases")} /></label>
      <label className={field}>Sender domains (e.g. openai.com)<Input value={f.domains} onChange={set("domains")} /></label>
      <label className={field}>Owner-confirmed fixed rate (leave blank if unknown)<Input type="text" inputMode="decimal" autoComplete="off" placeholder="e.g. 224.50" value={f.amount} onChange={set("amount")} aria-invalid={Boolean(amountError)} />{amountError && <span className="block text-xs text-red-400">{amountError}</span>}</label>
      <label className={field}>Currency (e.g. CAD, USD)<Input maxLength={3} value={f.currency} onChange={set("currency")} /></label>
      <label className={field}>Billing cycle<select className={select} value={f.cadence} onChange={set("cadence")}><option value="unknown">Unknown</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="other">Other</option></select></label>
      <label className={field}>Recurring schedule<select className={select} value={f.recurrenceStatus} onChange={set("recurrenceStatus")}><option value="unknown">Unconfirmed</option><option value="recurring">Recurring</option><option value="not-recurring">Not recurring</option><option value="usage-based">Usage-based</option></select></label>
      <label className={field}>Auto-renew<select className={select} value={f.autoRenewStatus} onChange={set("autoRenewStatus")}><option value="unknown">Not recorded</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
      <label className={field}>Next renewal date<Input type="date" value={f.renewal} onChange={set("renewal")} /></label>
      <label className={field}>Renewal date is<select className={select} value={f.basis} onChange={set("basis")}><option value="estimated">My estimate</option><option value="explicit">Stated on a bill or notice</option></select></label>
      <label className={`${field} sm:col-span-2`}>Website link (optional)<Input type="text" inputMode="url" placeholder="https://example.com" value={f.website} onChange={set("website")} aria-invalid={urlError ? true : undefined} aria-describedby={urlError ? "website-url-error" : undefined} /></label>
      {urlError && <p id="website-url-error" role="alert" className="text-xs text-destructive sm:col-span-2">{urlError}</p>}
      <label className={`${field} sm:col-span-2`}>Notes<Input value={f.notes} onChange={set("notes")} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || !f.name.trim()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function ServiceSummary({ subscriptions, evidence }: { subscriptions: SubscriptionRecord[]; evidence: SubscriptionEvidence[] }) {
  const counts = serviceBillingCounts(subscriptions, evidence);
  return <div className="pt-2"><h3 className="text-sm font-semibold">Your services</h3><p className="text-xs text-muted-foreground">{counts.services} services · {counts.recurring} recurring · {counts.notRecurring} not recurring · {counts.usageBased} usage-based · {counts.unconfirmed} unconfirmed</p></div>;
}

function ServiceCards({ subscriptions, evidence, onOpen }: { subscriptions: SubscriptionRecord[]; evidence: SubscriptionEvidence[]; onOpen: (id: string) => void }) {
  const visible = subscriptions.slice(0, 6);
  const overflow = subscriptions.slice(6);
  return <section aria-label="Subscription service cards" className="space-y-3">
    {subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No services saved.</p> : (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => { const display = serviceBillingDisplay(s, evidence); return <div key={s.id} role="button" tabIndex={0} className="flex h-auto min-h-24 cursor-pointer items-center justify-between gap-3 rounded-md border border-input bg-background p-3 text-left hover:bg-accent hover:text-accent-foreground" aria-label={`${s.name}: ${display.rate} · ${display.recurrenceLabel} — open service details`} onClick={() => onOpen(s.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(s.id); } }}>
          <span className="min-w-0"><span className="block truncate font-semibold">{s.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{display.planName}</span>{s.websiteUrl && <a className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-canx-blue underline underline-offset-2" href={s.websiteUrl} target="_blank" rel="noreferrer" aria-label={`Open the ${s.name} website in a new tab`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>Open website<ExternalLink className="h-3 w-3" /></a>}</span>
          <span className={display.rate !== "Rate unknown" ? "shrink-0 text-right text-sm font-semibold text-canx-green" : "shrink-0 text-right text-sm text-muted-foreground"}><span className="block">{display.rate}</span><span className="mt-1 block text-xs font-normal">{display.recurrenceLabel}</span><ChevronRight className="ml-auto mt-1 h-4 w-4" /></span>
        </div>; })}
      </div>
    )}
    {overflow.length > 0 && <Select onValueChange={onOpen}><SelectTrigger className="w-full sm:w-72" aria-label="Open another saved service"><SelectValue placeholder={`${overflow.length} more service${overflow.length === 1 ? "" : "s"}`} /></SelectTrigger><SelectContent>{overflow.map((s) => { const display = serviceBillingDisplay(s, evidence); return <SelectItem key={s.id} value={s.id}>{s.name} · {display.rate} · {display.recurrenceLabel}</SelectItem>; })}</SelectContent></Select>}
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>;
}
