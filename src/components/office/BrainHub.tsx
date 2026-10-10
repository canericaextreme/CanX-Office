import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, BookOpen, MessagesSquare, Brain, FolderKanban, BookOpenCheck, HelpCircle, Search, RefreshCw, ArrowLeft, Clock, Lamp } from "lucide-react";
import { OfficeFiles } from "./OfficeFiles";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { getBrainIndex, setBrainCategory } from "@/lib/brain-index.functions";
import {
  brainShelfRoute, brainShelfFromHash, BRAIN_PROVIDER_CARDS, BRAIN_CATEGORIES, CATEGORY_HELP, CATEGORY_LABELS, REFILEABLE, countByCategory, recentBrainItems, searchBrain,
  type BrainBucket, type BrainCategory, type BrainIndex, type BrainItem,
} from "@/lib/brain-index";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";

const ICONS: Record<BrainBucket, typeof Download> = {
  downloads: Download, knowledge: BookOpen, discussions: MessagesSquare, memory: Brain, projects: FolderKanban, "rules-skills": BookOpenCheck, unsorted: HelpCircle,
};
const roomLabel = (id: string | null) => (id ? OFFICE_ROOM_IDENTITIES.find((r) => r.id === id)?.shortLabel ?? id : "");
const when = (s: string | null) => { if (!s) return "date unknown"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "date unknown" : d.toLocaleDateString(); };

/** Brain as the hub of the whole Office: categories, search, counts, provenance, manual filing. */
/** `fixture` is only for fixture-render tests: shows a supplied index without reading the database. */
export function BrainHub({ fixture }: { fixture?: BrainIndex }) {
  const session = useOwnerSession();
  const read = useServerFn(getBrainIndex);
  const file = useServerFn(setBrainCategory);
  const [index, setIndex] = useState<BrainIndex | null>(fixture ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState<BrainBucket | null>(null);
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");
  const [folder, setFolder] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (fixture) return;
    let active = true;
    setIndex(null); setError("");
    if (!session.accessToken) return;
    setLoading(true);
    void read({ data: { accessToken: session.accessToken } })
      .then((r) => { if (!active) return; if (r.ok) setIndex(r.index); else setError(r.message); })
      .catch(() => { if (active) setError("The Brain index could not be read. Nothing is shown rather than guessing."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.accessToken, read, refresh, fixture]);

  const counts = useMemo(() => countByCategory(index?.items ?? []), [index]);
  // Open category, or a global search across every category when no category is open.
  const inCat = useMemo(() => (index?.items ?? []).filter((i) => cat === null || i.category === cat), [index, cat]);
  const recent = useMemo(() => recentBrainItems(index?.items ?? [], new Date(index?.checkedAt ?? Date.now())), [index]);
  const listing = cat !== null || query.trim().length > 0;
  const rooms = useMemo(() => [...new Set(inCat.map((i) => i.room).filter(Boolean) as string[])].sort(), [inCat]);
  const folders = useMemo(() => [...new Set(inCat.map((i) => i.folder).filter(Boolean) as string[])].sort(), [inCat]);
  const matches = useMemo(() => searchBrain(inCat, query, { room, folder }), [inCat, query, room, folder]);
  const shown = matches.slice(0, 200);

  const refile = async (item: BrainItem, next: BrainCategory) => {
    if (!session.accessToken || busyKey) return;
    setBusyKey(item.key); setNotice("");
    try {
      const r = await file({ data: { accessToken: session.accessToken, itemKey: item.key, category: next } });
      setNotice(r.message);
      if (r.ok) setRefresh((n) => n + 1); // reload from the database, never trust local state
    } catch { setNotice("The category was not saved. Nothing else changed."); }
    finally { setBusyKey(null); }
  };

  const buckets: BrainBucket[] = [...BRAIN_CATEGORIES, ...(counts.unsorted ? ["unsorted" as const] : [])];
  const tone = (b: BrainBucket) => `var(--brain-cat-${b})`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const [focusPending, setFocusPending] = useState(false);
  // Opening a category clears stale search/filters and moves focus to its heading.
  const open = (b: BrainBucket) => { window.history.pushState(null, "", brainShelfRoute(b)); setCat(b); setQuery(""); setRoom("all"); setFolder("all"); setFocusPending(true); };
  const backToHub = () => { window.history.pushState(null, "", window.location.pathname + window.location.search); setCat(null); setQuery(""); setRoom("all"); setFolder("all"); };
  useEffect(() => {
    const sync = () => {
      const shelf = brainShelfFromHash(window.location.hash);
      setCat(shelf); setQuery(""); setRoom("all"); setFolder("all"); setFocusPending(shelf !== null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); };
  }, []);
  useEffect(() => {
    if (!focusPending || cat === null) return;
    setFocusPending(false);
    headingRef.current?.focus();
    topRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [focusPending, cat]);

  const row = (i: BrainItem) => (
    <li key={i.key} className="rounded-lg border bg-[var(--brain-card)] p-3" style={{ borderColor: "var(--brain-line)", borderLeft: `4px solid ${tone(i.category)}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{i.title}</p>
          <p className="text-xs text-[var(--brain-room-muted)]">
            {[cat === null && CATEGORY_LABELS[i.category], i.room && `Room: ${roomLabel(i.room)}`, i.folder && `Folder: ${i.folder}`, when(i.at), i.version].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-[var(--brain-room-muted)]">Source: {i.provenance}{i.manual ? ` · filed here by you (was ${CATEGORY_LABELS[i.defaultCategory]})` : ""} · {i.access}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {i.route && (i.route.includes("#") ? <a className="text-xs font-semibold text-[var(--brain-cat-downloads)] underline-offset-2 hover:underline" href={i.route}>Open</a> : <Link to={i.route} className="text-xs font-semibold text-[var(--brain-cat-downloads)] underline-offset-2 hover:underline">Open {i.room ? roomLabel(i.room) : ""}</Link>)}
          {REFILEABLE.includes(i.kind) && (
            <select aria-label={`Category for ${i.title}`} className="h-9 rounded-md border bg-[var(--brain-card)] px-2 text-xs" style={{ borderColor: "var(--brain-line)" }} disabled={!session.stepUpComplete || busyKey !== null}
              value={i.category === "unsorted" ? "" : i.category} onChange={(e) => { const v = e.target.value as BrainCategory; if (v && v !== i.category) void refile(i, v); }}>
              {i.category === "unsorted" && <option value="">Choose a category…</option>}
              {BRAIN_CATEGORIES.filter((c) => c !== "projects" && c !== "rules-skills").map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <section ref={topRef} aria-label="Brain categories" className="relative overflow-hidden rounded-2xl border p-4 text-[var(--brain-room-ink)] sm:p-6"
      style={{ background: "radial-gradient(ellipse 60% 45% at 88% 0%, var(--brain-lamp), transparent 70%), var(--brain-room)", borderColor: "var(--brain-line)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#ba9848] bg-[#172943] p-6 text-white sm:p-8">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--brain-wood)", color: "var(--brain-card)" }} aria-hidden><Lamp className="h-5 w-5" /></span>
          <div>
            <h2 className="font-serif text-3xl">Brain — the Office's filing room</h2>
            <p className="mt-3 text-sm leading-relaxed">Choose a shelf to open it, or search everything. Nothing is copied or moved; each item keeps its room, folder and original name.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="border-[var(--brain-line)] bg-[var(--brain-card)] text-[var(--brain-room-ink)] hover:bg-[var(--brain-room)]" disabled={!session.accessToken || loading} onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {cat === null && <OfficeFiles room="brain" compact onSaved={() => setRefresh((n) => n + 1)} />}
        {index && <p className="text-xs text-[var(--brain-room-muted)]">Counts show indexed items from readable sources.{index.sources.some((s) => s.status !== "read") ? " Some sources are unavailable; these counts are partial. Open source details below." : " Source limits are listed below."}</p>}
      </div>
      <label className="mt-4 flex items-center gap-2 rounded-lg border bg-[var(--brain-card)] px-3" style={{ borderColor: "var(--brain-line)" }}>
        <Search className="h-4 w-4 text-[var(--brain-room-muted)]" aria-hidden />
        <input className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--brain-room-muted)]" placeholder={cat ? `Search ${CATEGORY_LABELS[cat]}` : "Search the whole Brain"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the Brain" />
      </label>

      <div className="mt-3 space-y-1">
        {!session.accessToken && <p className="text-sm text-[var(--brain-room-muted)]">Sign in as the owner to open the Brain index.</p>}
        {error && <p role="alert" className="text-sm font-medium text-[var(--brain-cat-memory)]">{error}</p>}
        {loading && <p role="status" className="text-sm text-[var(--brain-room-muted)]">Reading the Brain index…</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
      </div>

      {/* Shelf of category folders — hidden while one category is open */}
      {cat === null && <>
      <nav aria-label="Brain categories" className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {buckets.map((b, shelfNumber) => {
          const Icon = ICONS[b];
          const active = cat === b;
          return (
            <button key={b} type="button" onClick={() => open(b)} aria-pressed={active}
              aria-label={`Open ${CATEGORY_LABELS[b]}: ${index ? counts[b] : "unknown"} items`}
              className="group flex min-h-24 w-full cursor-pointer items-start gap-3 rounded-xl border bg-[var(--brain-card)] p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2"
              style={{ borderColor: active ? tone(b) : "var(--brain-line)", borderTop: `5px solid ${tone(b)}`, boxShadow: active ? `0 0 0 2px ${tone(b)}` : undefined }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${tone(b)} 14%, transparent)`, color: tone(b) }}><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider">Shelf {String(shelfNumber + 1).padStart(2, "0")}</span>
                <span className="block font-serif text-xl font-semibold">{CATEGORY_LABELS[b]}</span>
                <span className="block text-sm font-medium" style={{ color: tone(b) }}>{index ? `${counts[b]} item${counts[b] === 1 ? "" : "s"}` : "–"}</span>
                <span className="mt-1 line-clamp-2 block text-xs text-[var(--brain-room-muted)]">{CATEGORY_HELP[b]}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div aria-hidden className="mt-2 h-3 rounded-sm" style={{ background: "linear-gradient(180deg, var(--brain-wood), var(--brain-wood-dark))", boxShadow: "0 4px 6px -3px var(--brain-wood-dark)" }} />
      </>}

      {listing ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="border-[var(--brain-line)] bg-[var(--brain-card)] text-[var(--brain-room-ink)] hover:bg-[var(--brain-room)]" onClick={backToHub}>
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Back to all categories
            </Button>
            <h3 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none" style={cat ? { color: tone(cat) } : undefined}>
              {cat ? <>{(() => { const I = ICONS[cat]; return <I className="h-5 w-5" aria-hidden />; })()}{CATEGORY_LABELS[cat]}{index ? ` · ${counts[cat]} item${counts[cat] === 1 ? "" : "s"}` : ""}</> : "Search results across every category"}
            </h3>
            {rooms.length > 1 && <select aria-label="Room" className="h-10 rounded-md border bg-[var(--brain-card)] px-2 text-sm" style={{ borderColor: "var(--brain-line)" }} value={room} onChange={(e) => setRoom(e.target.value)}><option value="all">All rooms</option>{rooms.map((r) => <option key={r} value={r}>{roomLabel(r)}</option>)}</select>}
            {folders.length > 0 && <select aria-label="Earlier folder" className="h-10 rounded-md border bg-[var(--brain-card)] px-2 text-sm" style={{ borderColor: "var(--brain-line)" }} value={folder} onChange={(e) => setFolder(e.target.value)}><option value="all">All earlier folders</option>{folders.map((f) => <option key={f} value={f}>{f}</option>)}</select>}
          </div>
          {cat && <>
            <p className="text-sm text-[var(--brain-room-muted)]">{CATEGORY_HELP[cat]}</p>
            <div className="flex flex-wrap items-center gap-3">
              <OfficeFiles room="brain" compact onSaved={() => setRefresh((n) => n + 1)} />
              {cat === "knowledge" && <a href="#brain-documents" className="text-sm underline">Import document text for Elsie</a>}
              {cat === "memory" && <a href="#brain-memory" className="text-sm underline">Open memory controls</a>}
              {cat === "projects" && <Link to="/projects" className="text-sm underline">Open project register</Link>}
              {cat === "rules-skills" && <Link to="/skills" className="text-sm underline">Open Office Skills</Link>}
            </div>
            <p className="text-xs text-[var(--brain-room-muted)]">Computer uploads keep their original files and appear in Downloads. Use the category control to file eligible saved items on another shelf.</p>
          </>}
          {index && <p role="status" className="text-sm">{matches.length} matching item{matches.length === 1 ? "" : "s"}{matches.length > 200 ? " · showing first 200" : ""}</p>}
          {!index && loading && <p role="status" className="text-sm text-[var(--brain-room-muted)]">Reading this category…</p>}
          {!index && !loading && <p className="text-sm text-[var(--brain-room-muted)]">{error ? "This category can't be shown because the Brain index couldn't be read." : "Sign in as the owner to see what's in this category."}</p>}
          {index && (
            <ul aria-label={cat ? `${CATEGORY_LABELS[cat]} items` : "Search results"} className="space-y-2">
              {shown.length === 0 && <li className="text-sm text-[var(--brain-room-muted)]">{query ? "Nothing matches that search." : cat ? `Nothing is filed under ${CATEGORY_LABELS[cat]} yet.` : "Nothing here yet."}</li>}
              {shown.map(row)}
              {matches.length > 200 && <li className="text-xs text-[var(--brain-room-muted)]">Showing the first 200; narrow the search to see more.</li>}
            </ul>
          )}
        </div>
      ) : index && (
        <div className="mt-5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-base font-semibold"><Clock className="h-4 w-4" aria-hidden /> Recent activity · last 3 days</h3>
          {recent.length === 0
            ? <p className="text-sm text-[var(--brain-room-muted)]">Nothing saved in the last three days. Older items are on the shelves above and in search.</p>
            : <ul className="space-y-2">{recent.slice(0, 8).map(row)}</ul>}
          {recent.length > 8 && <p className="text-xs text-[var(--brain-room-muted)]">Showing the 8 newest of {recent.length} from the last three days; the rest are in their categories.</p>}
          <p className="text-xs text-[var(--brain-room-muted)]">Only items with a saved date are listed; items without a date stay in their categories.</p>
        </div>
      )}

      {cat === null && <div aria-label="Office builders" className="mt-5 grid gap-3 sm:grid-cols-2">
        {BRAIN_PROVIDER_CARDS.map((provider) => <article key={provider.label} className="rounded-xl border border-[var(--brain-line)] bg-[var(--brain-card)] p-4">
          <h3 className="font-serif text-xl font-semibold">{provider.label}</h3>
          <p className="mt-2 text-sm text-[var(--brain-room-muted)]">{provider.description}</p>
          <a href={provider.route} className="mt-3 inline-block text-sm font-semibold underline">Open {provider.label} builder</a>
        </article>)}
      </div>}
      {index && (
        <details className="mt-4 text-xs text-[var(--brain-room-muted)]">
          <summary className="cursor-pointer">Where this comes from · checked {new Date(index.checkedAt).toLocaleString()}</summary>
          <ul className="mt-2 space-y-1">
            {index.sources.map((s) => <li key={s.key}>{s.label}: {s.status === "read" ? `read${s.count !== null ? ` (${s.count})` : ""}` : s.status === "denied" ? "not shown — needs two-step verification" : "could not be read"}{s.detail ? ` · ${s.detail}` : ""}</li>)}
            {index.orphanLabels > 0 && <li>{index.orphanLabels} saved category label(s) point at items no longer listed; they are kept.</li>}
            <li>This is an index of names, rooms and versions. It doesn't open file contents; imported document text is searched separately with its coverage stated.</li>
            {!session.stepUpComplete && <li>Re-filing an item needs two-step verification.</li>}
          </ul>
        </details>
      )}
    </section>
  );
}
