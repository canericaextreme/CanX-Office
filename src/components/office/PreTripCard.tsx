import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useOwnerSession } from "@/lib/owner-session";
import { currentBuildVersion } from "@/lib/office-health";
import { cardState, morningReport, type Light, type PreTripCheck, type PreTripRecord } from "@/lib/pretrip";
import { readPreTrip, runPreTrip } from "@/lib/pretrip.functions";

/* One shared copy of the latest record for the card, the Reception light and the daily start. */
type Store = { record: PreTripRecord | null; loaded: boolean; running: boolean; message: string | null };
let store: Store = { record: null, loaded: false, running: false, message: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Store>) => { store = { ...store, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const usePreTripStore = () => useSyncExternalStore(subscribe, () => store, () => store);
let dailyStartedFor: string | null = null;

const TONE: Record<Light, "green" | "yellow" | "red" | "grey"> = { green: "green", yellow: "yellow", red: "red", unverified: "grey" };
const WORD: Record<Light, string> = { green: "Green", yellow: "Yellow", red: "Red", unverified: "Unverified" };

function usePreTripActions() {
  const session = useOwnerSession();
  const read = useServerFn(readPreTrip);
  const run = useServerFn(runPreTrip);
  const token = session.signedIn && !session.viewer ? session.accessToken : null;
  return {
    token,
    stepUp: session.stepUpComplete,
    async refresh() {
      if (!token) return;
      const r = await read({ data: { accessToken: token } }).catch(() => null);
      if (r?.ok) set({ record: r.record, loaded: true, message: null });
      else set({ loaded: true, message: r && !r.ok ? r.message : "The pre-trip record could not be read." });
    },
    async start(trigger: "daily" | "manual") {
      if (!token || store.running) return;
      set({ running: true, message: null });
      const r = await run({ data: { accessToken: token, trigger, buildId: currentBuildVersion() } }).catch(() => null);
      if (r?.ok) set({ running: false, loaded: true, record: r.record, message: r.saved ? null : r.detail });
      else set({ running: false, message: r && !r.ok ? r.message : "The pre-trip could not run. Office work is not affected." });
    },
  };
}

/**
 * Starts today's pre-trip once, the first time John opens the Office signed in with
 * two-step on a new Office-local day. Runs beside Elsie, never inside her replies.
 */
export function DailyPreTripStarter() {
  const actions = usePreTripActions();
  const s = usePreTripStore();
  useEffect(() => { if (actions.token && !s.loaded) void actions.refresh(); }, [actions.token, s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!actions.token || !actions.stepUp || !s.loaded || s.running) return;
    const view = cardState(s.record, new Date());
    if (view.state === "checked" || dailyStartedFor === view.date) return;
    dailyStartedFor = view.date;
    void actions.start("daily");
  }, [actions.token, actions.stepUp, s.loaded, s.running, s.record]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function CheckRow({ c }: { c: PreTripCheck }) {
  return (
    <li className="flex flex-wrap items-start gap-2 text-xs">
      <StatusBadge tone={TONE[c.status]} label={WORD[c.status]} />
      <span className="font-medium">{c.label}</span>
      <span className="basis-full text-muted-foreground sm:basis-auto">{c.detail}{c.since && c.status !== "green" ? ` · since ${c.since}` : ""}</span>
    </li>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function PreTripCardView({ record, now, running, message, onRun, canRun }: {
  record: PreTripRecord | null; now: Date; running: boolean; message: string | null; onRun?: () => void; canRun: boolean;
}) {
  const [open, setOpen] = useState(false);
  const view = cardState(record, now);
  const find = (id: string) => (view.state === "checked" ? view.record.checks.find((c) => c.id === id) : undefined);
  const light = (id: string) => { const c = find(id); return c ? WORD[c.status] : "Not checked"; };
  return (
    <Card className="border-border bg-card lg:col-span-2" data-canx-pretrip-card="true">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Daily Pre-Trip Card · {view.date}</CardTitle>
        {view.state === "checked"
          ? <StatusBadge tone={TONE[view.record.overall]} label={`Overall ${WORD[view.record.overall]}`} />
          : <StatusBadge tone="grey" label="NOT CHECKED TODAY" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {view.state === "checked" ? (
          <>
            <p className="text-sm">{morningReport(view.record)}</p>
            <div>
              <Row k="Inspection" v={view.record.inspection === "complete" ? "Complete" : "Partial"} />
              <Row k="ChatGPT (Office helper)" v={light("colleague:chatgpt")} />
              <Row k="Claude (Office helper)" v={light("colleague:claude")} />
              <Row k="Elsie's memory" v={light("continuity")} />
              <Row k="Office rooms" v={`${view.record.rooms.verified} of ${view.record.rooms.total} green`} />
              <Row k="Fresh emails needing you" v={view.record.email.needsAttention === null ? "Unknown" : String(view.record.email.needsAttention)} />
              <Row k="Email cleanup" v={view.record.email.archive === null ? "Unknown" : `${view.record.email.archive} to archive · delete: not counted`} />
              <Row k="Outstanding work" v={view.record.outstanding === null ? "Unknown" : String(view.record.outstanding)} />
              <Row k="New overnight problems" v={view.record.changes.newProblems.length ? view.record.changes.newProblems.join(", ") : "None found"} />
              <Row k="Pending approvals" v={view.record.approvals === null ? "Unknown" : String(view.record.approvals)} />
              <Row k="Last inspection" v={new Date(view.record.finishedAt).toLocaleString()} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Hide findings" : "Show all findings"}</Button>
            {open && (
              <ul className="space-y-2">
                {view.record.changes.carried.length > 0 && <li className="text-xs text-muted-foreground">Carried forward: {view.record.changes.carried.join("; ")}</li>}
                {view.record.changes.resolved.length > 0 && <li className="text-xs text-muted-foreground">Fixed since last time: {view.record.changes.resolved.join(", ")}</li>}
                {view.record.checks.map((c) => <CheckRow key={c.id} c={c} />)}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Today's pre-trip hasn't run yet. It starts on its own when you open the Office with two-step sign-in, or you can ask Elsie: "run your pre-trip again".
            </p>
            {view.carried.length > 0 && (
              <div>
                <p className="text-xs font-medium">Still open from {view.last?.date}:</p>
                <ul className="mt-1 space-y-1">{view.carried.map((c) => <CheckRow key={c.id} c={c} />)}</ul>
              </div>
            )}
          </>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        <p className="text-xs text-muted-foreground">
          Quick check only. Detailed diagnosis belongs in Office Health (Build &amp; Testing). The ChatGPT and Claude rows test the Office's own helpers, not your own chat apps.
        </p>
        {canRun && onRun && (
          <Button size="sm" disabled={running} onClick={onRun}>
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : "Run pre-trip again"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Owner's Desk card. */
export function PreTripCard() {
  const actions = usePreTripActions();
  const s = usePreTripStore();
  const [now, setNow] = useState(() => new Date());
  // Re-evaluate the date each minute so the card flips to NOT CHECKED TODAY at midnight.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (actions.token && !s.loaded) void actions.refresh(); }, [actions.token, s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!actions.token) return null;
  return <PreTripCardView record={s.record} now={now} running={s.running} message={s.message} canRun onRun={() => void actions.start("manual")} />;
}

/** Small light for Reception. */
export function PreTripBadge({ className = "", style }: { className?: string; style?: CSSProperties } = {}) {
  const actions = usePreTripActions();
  const s = usePreTripStore();
  useEffect(() => { if (actions.token && !s.loaded) void actions.refresh(); }, [actions.token, s.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!actions.token) return null;
  const view = cardState(s.record, new Date());
  return (
    <p className={`inline-flex flex-wrap items-center gap-2 text-sm ${className}`} style={style} data-canx-pretrip-badge="true">
      <span className="font-medium">Today's pre-trip:</span>
      {s.running ? <StatusBadge tone="blue" label="Checking now" />
        : view.state === "checked" ? <StatusBadge tone={TONE[view.record.overall]} label={`${WORD[view.record.overall]} · ${view.record.rooms.verified}/${view.record.rooms.total} rooms`} />
        : <StatusBadge tone="grey" label="NOT CHECKED TODAY" />}
      <span className="text-xs">Details on the Owner's Desk.</span>
    </p>
  );
}
