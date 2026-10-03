import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/office/StatusBadge";
import { gmailLink, type SubscriptionEvidence } from "@/lib/subscriptions";
import {
  filterRows,
  normalizeSender,
  reviewRows,
  type MailPreferences,
  type ReviewFilter,
} from "@/lib/mail-preferences";
import { getMailPreferences, setMailPreference } from "@/lib/mail-preferences.functions";

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: "all", label: "All active" },
  { id: "related", label: "Related" },
  { id: "needs-review", label: "Needs review" },
  { id: "ignored", label: "Ignored" },
];

/** Presentational view, exported for populated rendering tests. */
export function MailReviewView({
  evidence,
  prefs,
  filter,
  onFilter,
  onChange,
  busy,
  note,
}: {
  evidence: SubscriptionEvidence[];
  prefs: MailPreferences;
  filter: ReviewFilter;
  onFilter: (f: ReviewFilter) => void;
  onChange: (change: Record<string, unknown>) => void;
  busy: boolean;
  note: string;
}) {
  const rows = useMemo(() => reviewRows(evidence, prefs), [evidence, prefs]);
  const shown = filterRows(rows, filter);
  const count = (f: ReviewFilter) => filterRows(rows, f).length;
  return (
    <section aria-label="Saved mail review" className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Saved mail review</h3>
        <p className="text-xs text-muted-foreground">
          Elsie remembers the choices you save. “Ignore this email” skips that one email only. “Ignore future emails from…” is a separate button for that exact address. Removing a rule or undoing a choice affects later checks only — older skipped mail isn’t brought back automatically and may need a fresh check. Nothing here deletes saved emails or Finance records, and unknown mail stays in Needs review.
        </p>
      </div>
      <div role="tablist" aria-label="Filter saved mail" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.id} role="tab" aria-selected={filter === f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => onFilter(f.id)} className="min-h-10">
            {f.label} ({count(f.id)})
          </Button>
        ))}
      </div>
      {note ? <p className="text-xs text-foreground" role="status">{note}</p> : null}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">No saved mail in this view.</p> : (
        <ul className="space-y-2">
          {shown.slice(0, 60).map(({ evidence: e, category, why }) => {
            const sender = normalizeSender(e.from);
            const rule = sender ? prefs.senders.find((s) => s.sender === sender) : undefined;
            const msg = prefs.messages.find((m) => m.mailbox === e.mailbox.toLowerCase() && m.messageId === e.messageId);
            const base = { mailbox: e.mailbox, messageId: e.messageId, from: e.from, subject: e.subject };
            return (
              <li key={`${e.mailbox}|${e.messageId}`} data-review-category={category} className="rounded-md border border-border/50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium break-words">{e.subject || "(no subject)"}</div>
                    <div className="text-xs text-muted-foreground break-words">{e.from || "Sender unknown"} · {e.mailbox || "mailbox unknown"}</div>
                  </div>
                  <StatusBadge tone={category === "related" ? "green" : category === "ignored" ? "grey" : "yellow"} label={category === "related" ? "Related" : category === "ignored" ? "Ignored" : "Needs review"} />
                </div>
                <p className="mt-1 text-xs text-foreground">Why: {why}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {gmailLink(e.mailbox, e.messageId) ? (
                    <a className="inline-flex min-h-10 items-center gap-1 text-xs text-canx-blue underline" href={gmailLink(e.mailbox, e.messageId)} target="_blank" rel="noreferrer">
                      Open in Gmail <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : null}
                  <Button size="sm" variant="outline" className="min-h-10" disabled={busy || msg?.choice === "keep"} onClick={() => onChange({ op: "set-message", choice: "keep", ...base })}>Keep</Button>
                  <Button size="sm" variant="outline" className="min-h-10" disabled={busy || msg?.choice === "ignore"} onClick={() => onChange({ op: "set-message", choice: "ignore", ...base })}>Ignore this email</Button>
                  {msg ? <Button size="sm" variant="ghost" className="min-h-10" disabled={busy} onClick={() => onChange({ op: "clear-message", mailbox: e.mailbox, messageId: e.messageId })}>Undo choice</Button> : null}
                  {sender && rule?.action !== "ignore" ? (
                    <Button size="sm" variant="ghost" className="min-h-10" disabled={busy} onClick={() => onChange({ op: "set-sender", sender, action: "ignore", fromMessage: { mailbox: e.mailbox, messageId: e.messageId, subject: e.subject } })}>
                      Ignore future emails from {sender}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <h4 className="text-sm font-semibold">Sender rules ({prefs.senders.length})</h4>
        {prefs.senders.length === 0 ? <p className="text-xs text-muted-foreground">No sender rules saved.</p> : (
          <ul className="mt-1 space-y-1">
            {prefs.senders.map((s) => (
              <li key={s.sender} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-2 text-xs">
                <span className="break-words">
                  <strong>{s.action === "ignore" ? "Ignore" : "Keep"}</strong> future mail from {s.sender} · set {safeRuleDate(s.createdAt)} by {s.source === "elsie-instruction" ? "Elsie on your instruction" : "you"}
                  {s.fromMessage?.subject ? ` · from “${s.fromMessage.subject}”` : ""}
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" className="min-h-10" disabled={busy} onClick={() => onChange({ op: "set-sender", sender: s.sender, action: s.action === "ignore" ? "keep" : "ignore" })}>
                    Change to {s.action === "ignore" ? "Keep" : "Ignore"}
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-10" disabled={busy} onClick={() => onChange({ op: "remove-sender", sender: s.sender })}>Remove</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Order: Keep on one email, then Ignore on one email, then a sender Keep rule, then a sender Ignore rule.</p>
      </div>
    </section>
  );
}

export type PrefsLoad = { state: "loading" } | { state: "ready"; prefs: MailPreferences } | { state: "error"; message: string };

/** Loads mail preferences once for the whole Subscriptions room (single shared state). */
export function useMailPreferences(accessToken: string | null) {
  const [load, setLoad] = useState<PrefsLoad>({ state: "loading" });
  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    setLoad({ state: "loading" });
    getMailPreferences({ data: { accessToken } })
      .then((r) => { if (live) setLoad(r.ok && r.data ? { state: "ready", prefs: r.data } : { state: "error", message: r.message }); })
      .catch(() => { if (live) setLoad({ state: "error", message: "Mail preferences could not be read." }); });
    return () => { live = false; };
  }, [accessToken]);
  return [load, setLoad] as const;
}

/** Controlled panel: prefs are owned by SubscriptionManager; updated only after a verified save. */
export function MailReviewPanel({ accessToken, evidence, prefs, onPrefs }: {
  accessToken: string | null;
  evidence: SubscriptionEvidence[];
  prefs: PrefsLoad;
  onPrefs: (p: MailPreferences) => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (prefs.state === "loading") return <p className="text-xs text-muted-foreground">Loading your saved mail choices…</p>;
  if (prefs.state === "error") return <p className="text-xs text-destructive">{prefs.message} Your Ignore choices could not be applied, so ignored emails may still appear below.</p>;
  const change = async (c: Record<string, unknown>) => {
    if (!accessToken) return;
    setBusy(true);
    const r = await setMailPreference({ data: { accessToken, change: c } }).catch(() => null);
    setBusy(false);
    if (r?.ok && r.data) { onPrefs(r.data); setNote(r.message); }
    else setNote(r?.message ?? "The choice could not be saved, so it is not in effect.");
  };
  return <MailReviewView evidence={evidence} prefs={prefs.prefs} filter={filter} onFilter={setFilter} onChange={(c) => void change(c)} busy={busy} note={note} />;
}

/** Never throws on malformed saved dates (avoids the last-check style crash). */
export function safeRuleDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "date unknown";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "date unknown";
  try { return new Date(t).toISOString().slice(0, 10); } catch { return "date unknown"; }
}
