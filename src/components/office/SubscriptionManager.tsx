import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronRight, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useOwnerSession } from "@/lib/owner-session";
import {
  STARTER_SUBSCRIPTIONS,
  suggestedStarters,
  priceChangeFlags,
  renewalWarnings,
  weeklyView,
  type LastCheck,
  type SubscriptionEvidence,
  type SubscriptionRecord,
} from "@/lib/subscriptions";
import { CheckEmailsNow } from "@/components/office/CheckEmailsNow";
import { SubscriptionOverview } from "@/components/office/WeeklySubscriptionCards";
import { EvidenceFocusView, EvidenceMonthCards, type ArchiveContext, type ArchiveView } from "@/components/office/SubscriptionEvidenceArchive";
import { MailReviewPanel, useMailPreferences } from "@/components/office/MailReviewPanel";
import { visibleEvidence } from "@/lib/mail-preferences";
import { listSubscriptions, reviewSubscriptionEvidence, saveSubscriptionList } from "@/lib/subscriptions.functions";
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

        {state === "ready" && <h3 className="pt-2 text-sm font-semibold">Your services ({subs.length})</h3>}
        {state === "ready" && (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{s.name} <span className="text-xs text-muted-foreground">· {s.scope === "office" ? "Office" : s.scope === "personal" ? "Personal" : "Scope unknown"}</span></div>
                    <div className="text-xs text-muted-foreground">
                      Cost: {s.knownCost ? `${money(s.knownCost.amount, s.knownCost.currency)}${s.knownCost.asOf ? ` as of ${s.knownCost.asOf}` : ""} (${s.knownCost.source})` : "Unknown"} · Cadence: {s.cadence}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Next renewal: {s.nextRenewal ? `${s.nextRenewal.date} — ${s.nextRenewal.basis === "explicit" ? "stated in source" : "estimated"} (${s.nextRenewal.source})` : "Unknown"}
                    </div>
                    {s.history.length > 0 && (
                      <div className="text-xs text-muted-foreground">History: {s.history.map((h) => `${h.date} ${money(h.amount, h.currency)}`).join("; ")}</div>
                    )}
                    {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => persist(subs.filter((x) => x.id !== s.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
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

        {editing && <SubscriptionEditor value={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(rec) => {
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
    aliases: value.aliases.join(", "),
    domains: value.senderDomains.join(", "),
    scope: value.scope,
    cadence: value.cadence,
    amount: value.knownCost ? String(value.knownCost.amount) : "",
    currency: value.knownCost?.currency ?? "",
    asOf: value.knownCost?.asOf ?? "",
    renewal: value.nextRenewal?.date ?? "",
    basis: value.nextRenewal?.basis ?? "estimated",
    notes: value.notes,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const amount = f.amount.trim() === "" ? null : Number(f.amount);
  const field = "space-y-1 text-xs";
  const select = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <form className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const cost = amount !== null && Number.isFinite(amount) && /^[A-Za-z]{3}$/.test(f.currency)
        ? { amount, currency: f.currency.toUpperCase(), asOf: f.asOf, source: "John" } : null;
      // A changed confirmed cost moves the old one into dated history; nothing is lost.
      const history = value.knownCost && (!cost || cost.amount !== value.knownCost.amount || cost.currency !== value.knownCost.currency)
        ? [...value.history, { date: value.knownCost.asOf || new Date().toISOString().slice(0, 10), amount: value.knownCost.amount, currency: value.knownCost.currency, source: value.knownCost.source }]
        : value.history;
      onSave({
        ...value,
        id: value.id || `s-${Date.now().toString(36)}`,
        name: f.name.trim(),
        aliases: f.aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
        senderDomains: f.domains.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
        scope: f.scope,
        cadence: f.cadence,
        knownCost: cost,
        nextRenewal: f.renewal ? { date: f.renewal, basis: f.basis as "explicit" | "estimated", source: "John" } : null,
        history,
        notes: f.notes,
      });
    }}>
      <label className={field}>Service name<Input required value={f.name} onChange={set("name")} /></label>
      <label className={field}>Scope<select className={select} value={f.scope} onChange={set("scope")}><option value="office">Office</option><option value="personal">Personal</option><option value="unknown">Unknown</option></select></label>
      <label className={field}>Other names (comma separated)<Input value={f.aliases} onChange={set("aliases")} /></label>
      <label className={field}>Sender domains (e.g. openai.com)<Input value={f.domains} onChange={set("domains")} /></label>
      <label className={field}>Confirmed cost (leave blank if unknown)<Input inputMode="decimal" value={f.amount} onChange={set("amount")} /></label>
      <label className={field}>Currency (e.g. CAD, USD)<Input maxLength={3} value={f.currency} onChange={set("currency")} /></label>
      <label className={field}>Cost confirmed on<Input type="date" value={f.asOf} onChange={set("asOf")} /></label>
      <label className={field}>Billing cycle<select className={select} value={f.cadence} onChange={set("cadence")}><option value="unknown">Unknown</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="other">Other</option></select></label>
      <label className={field}>Next renewal date<Input type="date" value={f.renewal} onChange={set("renewal")} /></label>
      <label className={field}>Renewal date is<select className={select} value={f.basis} onChange={set("basis")}><option value="estimated">My estimate</option><option value="explicit">Stated on a bill or notice</option></select></label>
      <label className={`${field} sm:col-span-2`}>Notes<Input value={f.notes} onChange={set("notes")} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy || !f.name.trim()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
