import { OfficeHoursPanel } from "@/components/office/OfficeHours";
import { SafeHighwaysProgress } from "@/components/office/SafeHighwaysProgress";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, ArrowLeft, Bot, ChevronRight, Clock3, Coins, FolderKanban, Gauge, GitBranch, Loader2, MessageCircle, RefreshCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OfficeFiles } from "@/components/office/OfficeFiles";
import { BrainActivityCharts } from "@/components/office/BrainActivityCharts";
import { useOwnerSession } from "@/lib/owner-session";
import { getRoomSnapshot } from "@/lib/room-snapshot.functions";
import { currentBuildVersion, evaluateReleaseGate, loadResults } from "@/lib/office-health";
import { sendManagerHandoff } from "@/lib/companion-bridge";
import { CARD_GUIDE, MEASURED_STATES, STATE_LABEL, type Accent, type AnalyticsCard, type AnalyticsOverview, type CardId, type Metric, type MetricState, type Series, type Tone } from "@/lib/analytics-overview";

export const Route = createFileRoute("/_office/analytics")({ component: AnalyticsRoom });

const ICONS: Record<CardId, typeof Activity> = { health: Activity, money: Coins, api: Gauge, builders: Bot, sources: GitBranch, projects: FolderKanban, time: Clock3, bottlenecks: TrendingUp, actions: AlertTriangle, security: ShieldCheck };
const ACCENT: Record<Accent, { border: string; text: string; bar: string }> = {
  blue: { border: "border-sky-400/60", text: "text-sky-300", bar: "#38bdf8" },
  lime: { border: "border-lime-400/60", text: "text-lime-300", bar: "#a3e635" },
  orange: { border: "border-orange-400/60", text: "text-orange-300", bar: "#fb923c" },
};
const TONE_TEXT: Record<Tone, string> = { good: "text-lime-300", warn: "text-orange-300", alert: "text-orange-400", neutral: "text-slate-100" };
const STATE_CHIP: Record<MetricState, string> = {
  live: "border-lime-400/60 bg-lime-400/10 text-lime-200",
  estimate: "border-sky-400/60 bg-sky-400/10 text-sky-200",
  policy: "border-slate-400/60 bg-slate-400/10 text-slate-200",
  "not-connected": "border-dashed border-slate-500 text-slate-300",
  "not-measured": "border-dashed border-slate-500 text-slate-300",
  "awaiting-verification": "border-dashed border-amber-400/70 text-amber-200",
  "needs-two-step": "border-orange-400/70 bg-orange-400/10 text-orange-200",
  "not-shared": "border-dashed border-slate-500 text-slate-300",
  failed: "border-orange-500/80 bg-orange-500/15 text-orange-200",
};

/** Example questions John asked for; each opens Elsie with an unsent draft. */
export const ELSIE_QUESTIONS = [
  "Elsie, explain this whole Analytics room like I'm 10 years old.",
  "Elsie, explain my API costs.",
  "Elsie, what's holding up our builds?",
  "Elsie, are Claude and ChatGPT working efficiently?",
] as const;

export function askElsieAboutCard(card: Pick<AnalyticsCard, "title">, simple: boolean): string {
  return simple
    ? `Elsie, explain the "${card.title}" card in the Analytics room like I'm 10 years old: what it measures, what the numbers mean, whether they are real and current, why it matters, what needs attention and what you recommend.`
    : `Elsie, explain the "${card.title}" card in the Analytics room: what it measures, what the numbers mean, whether they are real and current, why it matters, what needs attention and what you recommend.`;
}

function askElsie(text: string) {
  sendManagerHandoff({ text, room: "Analytics", path: "/analytics", source: "room_button" });
}

export function StateChip({ state }: { state: MetricState }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_CHIP[state]}`}>{STATE_LABEL[state]}</span>;
}

function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-CA", { timeZone: "America/Whitehorse", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Bars (or a single trend) drawn from real points only. An empty or unread series says so instead of drawing. */
export function SeriesChart({ series, height = 110, compact = false }: { series: Series[]; height?: number; compact?: boolean }) {
  const usable = series.filter((s) => s.points.length && MEASURED_STATES.includes(s.state));
  if (!usable.length) return <div className="flex h-full min-h-16 items-center justify-center rounded-lg border border-dashed border-slate-600 px-3 text-center text-xs text-slate-400">No measured data to draw</div>;
  const labels = usable[0]!.points.map((p) => p.label);
  const max = Math.max(1, ...usable.flatMap((s) => s.points.map((p) => p.value)));
  const groups = labels.length, per = usable.length;
  const W = compact ? 300 : 640, H = height, pad = compact ? 16 : 18, top = compact ? 24 : 14;
  const slot = (W - pad * 2) / groups, barW = Math.max(2, (slot * 0.72) / per);
  const summary = usable.map((s) => `${s.label}: ${s.points.map((p) => `${p.label} ${p.value}`).join(", ")} ${s.unit}`).join(". ");
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block w-full" style={{ height: H }} preserveAspectRatio="none">
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#334155" strokeWidth="1" />
        {usable.map((s, si) => s.points.map((p, i) => {
          const h = ((H - pad - top) * p.value) / max;
          const x = pad + i * slot + (slot - barW * per) / 2 + si * barW;
          return <rect key={`${si}-${i}`} x={x} y={H - pad - h} width={barW - 1} height={Math.max(p.value > 0 ? 1.5 : 0, h)} rx="1.5" fill={ACCENT[s.accent].bar} opacity="0.9"><title>{`${s.label} · ${p.label}: ${p.value} ${s.unit}`}</title></rect>;
        }))}
        {labels.map((l, i) => (groups <= 12 || i % Math.ceil(groups / (compact ? 6 : 10)) === 0) && <text key={l + i} x={pad + i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize={compact ? 11 : 9} fill="#94a3b8">{l}</text>)}
        {compact && <text x={pad} y={12} fontSize="11" fill="#cbd5e1">highest {max} {usable[0]!.unit}</text>}
      </svg>
      {!compact && <figcaption className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">{usable.map((s) => <span key={s.label} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: ACCENT[s.accent].bar }} />{s.label} · {STATE_LABEL[s.state]} · max {Math.max(...s.points.map((p) => p.value))} {s.unit}</span>)}</figcaption>}
    </figure>
  );
}

function MetricRow({ m }: { m: Metric }) {
  return (
    <li className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-200">{m.label}</span>
        <StateChip state={m.state} />
      </div>
      <div className={`mt-1 text-base font-semibold ${m.value ? TONE_TEXT[m.tone] : "text-slate-400"}`}>{m.value ?? STATE_LABEL[m.state]}</div>
      {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
      <p className="mt-1 text-[11px] text-slate-500">Source: {m.source}{m.updatedAt ? ` · read ${shortTime(m.updatedAt)}` : ""}</p>
    </li>
  );
}

/** Card face: one headline reading and its honesty label. */
export function CardButton({ card, onOpen }: { card: AnalyticsCard; onOpen: (id: CardId) => void }) {
  const Icon = ICONS[card.id];
  const a = ACCENT[card.accent];
  const h = card.headline;
  const warn = card.attention.length > 0;
  return (
    <button type="button" onClick={() => onOpen(card.id)} data-card={card.id}
      className={`group flex min-h-[132px] flex-col rounded-xl border bg-[#0f161d]/90 p-3 text-left shadow-lg backdrop-blur-sm transition hover:bg-[#13202a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${a.border}`}>
      <div className="flex w-full items-start justify-between gap-2">
        <span className="flex items-center gap-2"><Icon className={`h-5 w-5 ${a.text}`} aria-hidden /><span className="text-sm font-semibold text-white">{card.title}</span></span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-300" aria-hidden />
      </div>
      <div className={`mt-2 line-clamp-2 text-[15px] font-semibold leading-snug ${h.value ? TONE_TEXT[h.tone] : "text-slate-400"}`}>{h.value ?? STATE_LABEL[h.state]}</div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <StateChip state={h.state} />
        {warn ? <span className="inline-flex items-center gap-1 text-[11px] text-orange-300"><AlertTriangle className="h-3 w-3" aria-hidden />{card.attention.length} to check</span> : <span className="text-[11px] text-slate-500">{card.subtitle}</span>}
      </div>
    </button>
  );
}

export function CardDetail({ card, onClose, canAsk }: { card: AnalyticsCard; onClose: () => void; canAsk: boolean }) {
  const Icon = ICONS[card.id];
  const guide = CARD_GUIDE[card.id];
  const closeRef = useRef<HTMLButtonElement>(null);
  // Focus moves into the dialog and returns to the card that opened it on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, []);
  // Keep Tab inside the open dialog.
  const trapTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={`${card.title} details`} onClick={(e) => e.stopPropagation()} onKeyDown={trapTab}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-sky-400/40 bg-[#0c1218] p-5 text-white shadow-2xl">
        <button ref={closeRef} type="button" onClick={onClose} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:bg-slate-800"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to overview</button>
        <div className="flex items-center gap-3"><Icon className={`h-7 w-7 ${ACCENT[card.accent].text}`} aria-hidden /><h2 className="text-2xl font-bold">{card.title}</h2></div>
        <p className="mt-2 text-sm text-slate-300">Measures {guide.measures}. It matters because {guide.why}.</p>
        {card.series.length > 0 && <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3"><SeriesChart series={card.series} height={150} /></div>}
        <h3 className="mt-5 font-semibold text-sky-200">Readings</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">{card.metrics.map((m) => <MetricRow key={m.label} m={m} />)}</ul>
        {card.items.length > 0 && <>
          <h3 className="mt-5 font-semibold text-sky-200">Details</h3>
          <ul className="mt-2 space-y-1.5 text-sm">{card.items.map((i) => <li key={i.label + i.detail} className="rounded-md border border-slate-700/60 bg-slate-900/50 px-3 py-2"><span className={`font-medium ${TONE_TEXT[i.tone]}`}>{i.label}</span><span className="block text-xs text-slate-400">{i.detail}</span></li>)}</ul>
        </>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-orange-400/40 bg-orange-400/5 p-3"><h3 className="font-semibold text-orange-200">Needs attention</h3>
            {card.attention.length ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-orange-100">{card.attention.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-sm text-slate-300">Nothing in this read.</p>}</div>
          <div className="rounded-xl border border-lime-400/40 bg-lime-400/5 p-3"><h3 className="font-semibold text-lime-200">Recommendation</h3><p className="mt-1 text-sm text-slate-100">{card.recommendation}</p></div>
        </div>
        <p className="mt-4 text-xs text-slate-400">Normal: {guide.normal}. Warning: {guide.warning}. Labels: Live = read just now; Estimate = from real records but approximate; Policy limit = John's rule, not spending; Not connected / Not measured / Awaiting verification = no reading, never shown as zero.</p>
        {canAsk && <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => askElsie(askElsieAboutCard(card, true))} className="inline-flex items-center gap-2 rounded-lg border border-lime-400/60 bg-lime-400/10 px-3 py-2 text-sm text-lime-100 hover:bg-lime-400/20"><MessageCircle className="h-4 w-4" aria-hidden /> Ask Elsie: explain like I'm 10</button>
          <button type="button" onClick={() => askElsie(askElsieAboutCard(card, false))} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/60 px-3 py-2 text-sm text-sky-100 hover:bg-sky-400/10">Ask Elsie for the full explanation</button>
          <span className="self-center text-xs text-slate-500">Opens Elsie with an unsent draft; nothing is sent until you press Send or say it.</span>
        </div>}
      </section>
    </div>
  );
}

/** Soft highway-and-mountains artwork behind the board. Decorative only. */
export function Backdrop() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="an-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0b0f14" stopOpacity="0" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0.35" /></linearGradient>
        <linearGradient id="an-road" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#94a3b8" stopOpacity="0.2" /><stop offset="1" stopColor="#cbd5e1" stopOpacity="0.9" /></linearGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#an-sky)" />
      <polygon points="0,620 180,430 300,520 470,340 640,540 780,420 930,560 1080,380 1240,520 1440,410 1440,900 0,900" fill="#2f5f73" />
      <polygon points="470,340 520,390 500,388 470,360 445,392 425,390" fill="#e2e8f0" />
      <polygon points="1080,380 1125,425 1105,423 1080,400 1058,428 1040,426" fill="#e2e8f0" />
      <polygon points="0,700 220,560 420,650 600,540 820,660 1010,560 1220,650 1440,580 1440,900 0,900" fill="#1b4150" />
      <polygon points="690,640 750,640 1140,900 300,900" fill="url(#an-road)" opacity="0.55" />
      {[0, 1, 2, 3, 4].map((i) => <polygon key={i} points={`${717 - i * 3},${660 + i * 50} ${723 + i * 3},${660 + i * 50} ${725 + i * 4},${690 + i * 50} ${715 - i * 4},${690 + i * 50}`} fill="#a3e635" opacity="0.8" />)}
    </svg>
  );
}

export type LoadState = { kind: "signed-out" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; overview: AnalyticsOverview };

/** The whole board, given a load state. Exported for fixture-render tests. */
export function AnalyticsBoard({ load, onRefresh, busy, canAsk, deviceCheck }: { load: LoadState; onRefresh: () => void; busy: boolean; canAsk: boolean; deviceCheck: string }) {
  const [selected, setSelected] = useState<CardId | null>(null);
  const overview = load.kind === "ready" ? load.overview : null;
  const card = overview?.cards.find((c) => c.id === selected) ?? null;
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);
  const health = overview?.cards.find((c) => c.id === "health");
  const chart = (id: CardId) => overview?.cards.find((c) => c.id === id);
  const status = load.kind === "signed-out" ? "Sign in to load measurements. Nothing is read while signed out."
    : load.kind === "loading" ? "Reading the Office records…"
    : load.kind === "error" ? `Not loaded: ${load.message}`
    : `${health?.headline.value ?? ""} · checked ${shortTime(load.overview.checkedAt)} Whitehorse time${load.overview.signIn === "one-step" ? " · two-step sign-in is off, so protected numbers are hidden" : ""}`;
  const tone = load.kind === "ready" ? (health?.headline.tone === "good" ? "text-lime-300" : "text-orange-300") : load.kind === "error" ? "text-orange-300" : "text-slate-300";
  return (
    <div className="relative mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[.24em] text-lime-300">CanX · Office control</p>
          <h1 className="text-2xl font-bold text-white md:text-3xl">Analytics <span className="text-sky-300">Control Room</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAsk && <button type="button" onClick={() => askElsie(ELSIE_QUESTIONS[0])} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-lime-400/60 bg-lime-400/10 px-3 text-xs font-medium text-lime-100 hover:bg-lime-400/20"><MessageCircle className="h-4 w-4" aria-hidden /> Elsie, explain this room like I'm 10</button>}
          <button type="button" onClick={onRefresh} disabled={busy || load.kind === "signed-out"} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-sky-400/50 px-3 text-xs text-sky-100 hover:bg-sky-400/10 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="h-3.5 w-3.5" aria-hidden />} Refresh
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-gradient-to-r from-[#0d1c26]/95 via-[#0d1a20]/95 to-[#13200f]/95 px-4 py-2.5">
        <div className="flex items-center gap-3"><Activity className="h-6 w-6 text-lime-300" aria-hidden /><div><div className="text-sm font-bold text-white">Overall Office Health</div><div role="status" className={`text-xs ${tone}`}>{status}</div></div></div>
        <div className="text-xs text-slate-300">Room check on this device: {deviceCheck}</div>
      </div>
      <section aria-label="Analytics overview" className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
        {overview
          ? overview.cards.map((c) => <CardButton key={c.id} card={c} onOpen={setSelected} />)
          : Array.from({ length: 10 }, (_, i) => <div key={i} className="min-h-[132px] rounded-xl border border-slate-700/60 bg-[#0f161d]/80 p-3 text-xs text-slate-500">{load.kind === "loading" ? "Loading…" : "Not loaded"}</div>)}
      </section>
      <div className="mt-3 grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">
        {(["api", "money", "builders"] as const).map((id) => {
          const c = chart(id);
          const title = id === "api" ? "AI meter — cents per day" : id === "money" ? "CAD receipts by month" : "Builds passed vs failed";
          return (
            <section key={id} className="rounded-xl border border-slate-700/70 bg-[#0f161d]/90 p-3">
              <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-white">{title}{c && <StateChip state={c.series[0]?.state ?? c.headline.state} />}</h2>
              <div className="mt-2 h-24">{c ? <SeriesChart series={c.series} height={96} compact /> : <div className="flex h-full items-center justify-center text-xs text-slate-500">Not loaded</div>}</div>
            </section>
          );
        })}
        <section className="rounded-xl border border-lime-400/30 bg-[#0f161d]/90 p-3">
          <h2 className="text-sm font-semibold text-lime-200">Ask Elsie</h2>
          {canAsk ? <ul className="mt-1.5 space-y-1">{ELSIE_QUESTIONS.slice(1).map((q) => <li key={q}><button type="button" onClick={() => askElsie(q)} className="w-full rounded-md px-2 py-1 text-left text-xs text-slate-200 hover:bg-lime-400/10">“{q.replace("Elsie, ", "")}”</button></li>)}</ul>
            : <p className="mt-1.5 text-xs text-slate-400">Elsie is not available in this read-only view.</p>}
        </section>
      </div>
      {card && <CardDetail card={card} onClose={() => setSelected(null)} canAsk={canAsk} />}
    </div>
  );
}

function AnalyticsRoom() {
  const session = useOwnerSession();
  const fetchSnapshot = useServerFn(getRoomSnapshot);
  const token = session.accessToken;
  const [load, setLoad] = useState<LoadState>({ kind: token ? "loading" : "signed-out" });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const [deviceCheck, setDeviceCheck] = useState("not recorded");

  const refresh = useCallback(async () => {
    if (!token) { setLoad({ kind: "signed-out" }); return; }
    const mine = ++seq.current;
    setBusy(true);
    try {
      const reply = await fetchSnapshot({ data: { accessToken: token, route: "/analytics", buildId: currentBuildVersion() } });
      if (mine !== seq.current) return;
      if (!reply.ok) { setLoad({ kind: "error", message: reply.message }); return; }
      const overview = reply.snapshot.sources.find((s) => s.key === "analytics")?.analytics;
      setLoad(overview ? { kind: "ready", overview } : { kind: "error", message: "The measurements could not be read just now." });
    } catch {
      if (mine === seq.current) setLoad({ kind: "error", message: "The measurements could not be read just now." });
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [token, fetchSnapshot]);

  useEffect(() => { void refresh(); return () => { seq.current++; }; }, [refresh]);
  useEffect(() => {
    const gate = evaluateReleaseGate(loadResults(), currentBuildVersion());
    setDeviceCheck(gate.state === "verified" ? "verified on this build" : gate.state === "failed" ? `failed (${gate.failed.join(", ")})` : "not verified on this build yet");
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0f14] px-4 py-4 text-white md:px-6">
      <Backdrop />
      <AnalyticsBoard load={load} onRefresh={() => void refresh()} busy={busy} canAsk={!session.viewer} deviceCheck={deviceCheck} />
      <OfficeHoursPanel />
      <SafeHighwaysProgress variant="analytics" />
      <BrainActivityCharts viewer={!!session.viewer} />
      <div className="relative mx-auto mt-4 max-w-[1500px] space-y-3"><RoomSkillsLink route="/analytics" /><OfficeFiles room="analytics" /></div>
    </main>
  );
}
