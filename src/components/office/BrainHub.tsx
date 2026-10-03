import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, BookOpen, MessagesSquare, Brain, FolderKanban, BookOpenCheck, HelpCircle, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { getBrainIndex, setBrainCategory } from "@/lib/brain-index.functions";
import {
  BRAIN_CATEGORIES, CATEGORY_HELP, CATEGORY_LABELS, REFILEABLE, countByCategory, searchBrain,
  type BrainBucket, type BrainCategory, type BrainIndex, type BrainItem,
} from "@/lib/brain-index";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";

const ICONS: Record<BrainBucket, typeof Download> = {
  downloads: Download, knowledge: BookOpen, discussions: MessagesSquare, memory: Brain, projects: FolderKanban, "rules-skills": BookOpenCheck, unsorted: HelpCircle,
};
const roomLabel = (id: string | null) => (id ? OFFICE_ROOM_IDENTITIES.find((r) => r.id === id)?.shortLabel ?? id : "");
const when = (s: string | null) => { if (!s) return "date unknown"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "date unknown" : d.toLocaleDateString(); };

/** Brain as the hub of the whole Office: categories, search, counts, provenance, manual filing. */
export function BrainHub() {
  const session = useOwnerSession();
  const read = useServerFn(getBrainIndex);
  const file = useServerFn(setBrainCategory);
  const [index, setIndex] = useState<BrainIndex | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState<BrainBucket>("downloads");
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");
  const [folder, setFolder] = useState("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setIndex(null); setError("");
    if (!session.accessToken) return;
    setLoading(true);
    void read({ data: { accessToken: session.accessToken } })
      .then((r) => { if (!active) return; if (r.ok) setIndex(r.index); else setError(r.message); })
      .catch(() => { if (active) setError("The Brain index could not be read. Nothing is shown rather than guessing."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.accessToken, read, refresh]);

  const counts = useMemo(() => countByCategory(index?.items ?? []), [index]);
  const inCat = useMemo(() => (index?.items ?? []).filter((i) => i.category === cat), [index, cat]);
  const rooms = useMemo(() => [...new Set(inCat.map((i) => i.room).filter(Boolean) as string[])].sort(), [inCat]);
  const folders = useMemo(() => [...new Set(inCat.map((i) => i.folder).filter(Boolean) as string[])].sort(), [inCat]);
  const shown = useMemo(() => searchBrain(inCat, query, { room, folder }).slice(0, 200), [inCat, query, room, folder]);

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

  return (
    <section aria-label="Brain categories" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Brain — everything the Office has saved</h2>
          <p className="text-sm text-muted-foreground">One index of saved items from every room. Nothing is copied or moved; each item keeps its room, folder and original name.</p>
        </div>
        <Button size="sm" variant="outline" disabled={!session.accessToken || loading} onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>
      {!session.accessToken && <p className="text-sm text-muted-foreground">Sign in as the owner to open the Brain index.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Reading the Brain index…</p>}

      <nav aria-label="Brain categories" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {buckets.map((b) => {
          const Icon = ICONS[b];
          return (
            <button key={b} type="button" onClick={() => { setCat(b); setRoom("all"); setFolder("all"); }} aria-pressed={cat === b}
              className={`flex min-h-16 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${cat === b ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/60"}`}>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Icon className="h-4 w-4" aria-hidden /> {CATEGORY_LABELS[b]}</span>
              <span className="text-xs text-muted-foreground">{index ? counts[b] : "–"} item{counts[b] === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </nav>

      <p className="text-sm text-muted-foreground">{CATEGORY_HELP[cat]}</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder={`Search ${CATEGORY_LABELS[cat]}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the Brain" />
        </label>
        {rooms.length > 1 && <select aria-label="Room" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={room} onChange={(e) => setRoom(e.target.value)}><option value="all">All rooms</option>{rooms.map((r) => <option key={r} value={r}>{roomLabel(r)}</option>)}</select>}
        {folders.length > 0 && <select aria-label="Earlier folder" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="all">All earlier folders</option>{folders.map((f) => <option key={f} value={f}>{f}</option>)}</select>}
      </div>
      {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}

      {index && (
        <ul className="space-y-2">
          {shown.length === 0 && <li className="text-sm text-muted-foreground">Nothing here{query ? " matches that search" : " yet"}.</li>}
          {shown.map((i) => (
            <li key={i.key} className="rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{i.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[i.room && `Room: ${roomLabel(i.room)}`, i.folder && `Folder: ${i.folder}`, when(i.at), i.version].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-muted-foreground">Source: {i.provenance}{i.manual ? ` · filed here by you (was ${CATEGORY_LABELS[i.defaultCategory]})` : ""} · {i.access}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {i.route && (i.route.includes("#") ? <a className="text-xs font-medium text-primary underline-offset-2 hover:underline" href={i.route}>Open</a> : <Link to={i.route} className="text-xs font-medium text-primary underline-offset-2 hover:underline">Open {i.room ? roomLabel(i.room) : ""}</Link>)}
                  {REFILEABLE.includes(i.kind) && (
                    <select aria-label={`Category for ${i.title}`} className="h-9 rounded-md border border-border bg-background px-2 text-xs" disabled={!session.stepUpComplete || busyKey !== null}
                      value={i.category === "unsorted" ? "" : i.category} onChange={(e) => { const v = e.target.value as BrainCategory; if (v && v !== i.category) void refile(i, v); }}>
                      {i.category === "unsorted" && <option value="">Choose a category…</option>}
                      {BRAIN_CATEGORIES.filter((c) => c !== "projects" && c !== "rules-skills").map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {index && (
        <details className="text-xs text-muted-foreground">
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
