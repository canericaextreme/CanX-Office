import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { getProjectRegister, setProjectCategory, setProjectPlan } from "@/lib/project-register.functions";
import { ProjectLocatorPanel } from "./ProjectLocatorPanel";
import type { Locator, ProjectPlan } from "@/lib/project-locator";
import { PROJECT_CATEGORIES, countProjectCategories, type RegisteredProject } from "@/lib/project-register";

/** Owner's register of real Lovable projects, read from saved records. Read-only towards the projects themselves. */
export function ProjectRegister() {
  const session = useOwnerSession();
  const read = useServerFn(getProjectRegister);
  const save = useServerFn(setProjectCategory);
  const savePlan = useServerFn(setProjectPlan);
  const [locators, setLocators] = useState<Map<string, Locator>>(new Map());
  const [tasksReadAt, setTasksReadAt] = useState<string | null>(null);
  const [projects, setProjects] = useState<RegisteredProject[] | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [error, setError] = useState("");
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    if (!session.accessToken || !session.canReadProtected) return;
    void read({ data: { accessToken: session.accessToken } })
      .then((r) => { if (!active) return; if (r.ok) { setProjects(r.projects); setCheckedAt(r.checkedAt); setLocators(new Map(r.locators.map((l) => [l.project.projectId, l]))); setTasksReadAt(r.tasksReadAt); } else setError(r.message); })
      .catch(() => { if (active) setError("The project register could not be read."); });
    return () => { active = false; };
  }, [session.accessToken, session.canReadProtected, read, refresh]);

  // Stay current: re-read when John returns to this tab (after Work Board or Elsie actions elsewhere).
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") setRefresh((n) => n + 1); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, []);

  const plan = async (p: RegisteredProject, next: Partial<ProjectPlan>) => {
    if (!session.accessToken || busy) return;
    setBusy(p.projectId); setNotice("");
    try { const r = await savePlan({ data: { accessToken: session.accessToken, projectId: p.projectId, plan: next } }); setNotice(r.message); if (r.ok) setRefresh((n) => n + 1); }
    catch { setNotice("The plan was not saved. Nothing else changed."); }
    finally { setBusy(null); }
  };

  const counts = useMemo(() => countProjectCategories(projects ?? []), [projects]);
  const shown = useMemo(() => {
    const w = query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
    return (projects ?? []).filter((p) => (cat === "all" || p.category === cat) && w.every((x) => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(x)));
  }, [projects, cat, query]);

  const refile = async (p: RegisteredProject, category: string) => {
    if (!session.accessToken || busy) return;
    setBusy(p.projectId); setNotice("");
    try { const r = await save({ data: { accessToken: session.accessToken, projectId: p.projectId, category } }); setNotice(r.message); if (r.ok) setRefresh((n) => n + 1); }
    catch { setNotice("The category was not saved. Nothing else changed."); }
    finally { setBusy(null); }
  };

  return (
    <section aria-label="Project register" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Lovable projects</h2>
          <p className="text-sm text-muted-foreground">A register of your projects, imported as saved records. Opening a link takes you to that project; nothing here changes it.</p>
        </div>
        <Button size="sm" variant="outline" disabled={!session.stepUpComplete} onClick={() => setRefresh((n) => n + 1)}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Refresh</Button>
      </div>
      {!session.canReadProtected && <p className="text-sm text-muted-foreground">Sign in as the owner with your authenticator code to see your projects.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {projects && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Project categories">
            <Button size="sm" variant={cat === "all" ? "default" : "outline"} onClick={() => setCat("all")}>All ({projects.length})</Button>
            {Object.entries(counts).map(([k, v]) => <Button key={k} size="sm" variant={cat === k ? "default" : "outline"} onClick={() => setCat(k)}>{k} ({v})</Button>)}
          </div>
          <label className="flex max-w-md items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
          </label>
          {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <article key={p.projectId} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                <p className="text-xs text-muted-foreground">Project {p.projectId.slice(0, 8)}… · {p.provider} · checked {p.sourceCheckedOn ?? "date unknown"}</p>
                {p.description && <p className="line-clamp-4 text-sm text-muted-foreground">{p.description}</p>}
                <dl className="grid grid-cols-2 gap-x-2 text-xs">
                  <dt className="text-muted-foreground">Published flag</dt><dd>{p.published === null ? "unknown" : p.published ? "yes" : "no"}</dd>
                  <dt className="text-muted-foreground">Live address</dt><dd>{p.liveUrl ? "recorded" : "unknown"}</dd>
                  <dt className="text-muted-foreground">Health</dt><dd>{p.health}</dd>
                  <dt className="text-muted-foreground">Live data</dt><dd>{p.liveDataAccess}</dd>
                  <dt className="text-muted-foreground">Code</dt><dd>{p.githubUrl ? "GitHub recorded" : "unknown"}{p.latestCommit ? ` · ${p.latestCommit.slice(0, 7)}` : ""}</dd>
                </dl>
                <div className="flex flex-wrap gap-3 text-xs">
                  {p.editorUrl && <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={p.editorUrl} target="_blank" rel="noopener noreferrer">Editor <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                  {p.previewUrl && <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={p.previewUrl} target="_blank" rel="noopener noreferrer">Preview <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                  {p.liveUrl && <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={p.liveUrl} target="_blank" rel="noopener noreferrer">Live <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                  {p.githubUrl && <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={p.githubUrl} target="_blank" rel="noopener noreferrer">GitHub <ExternalLink className="h-3 w-3" aria-hidden /></a>}
                </div>
                <label className="mt-auto text-xs text-muted-foreground">Category
                  <select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" disabled={busy !== null} value={(PROJECT_CATEGORIES as readonly string[]).includes(p.category) ? p.category : "Other"} onChange={(e) => void refile(p, e.target.value)}>
                    {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <p className="text-[11px] text-muted-foreground">{p.categoryManual ? `Filed by you (imported as ${p.importedCategory})` : `Imported category · ${p.categoryBasis}`}</p>
                {locators.get(p.projectId) && <ProjectLocatorPanel key={`${p.projectId}-${locators.get(p.projectId)!.plan.savedAt ?? ""}`} loc={locators.get(p.projectId)!} busy={busy !== null} onSave={(next) => void plan(p, next)} />}
                {p.issues.length > 0 && <p className="text-[11px] text-destructive">{p.issues.join("; ")}</p>}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Read {new Date(checkedAt).toLocaleString()}. Each project's details are as checked on the date shown; there is no ongoing sync with Lovable. Work Board {tasksReadAt ? `read ${new Date(tasksReadAt).toLocaleString()}` : "could not be read"}. "Not tested" and "Not connected" mean exactly that.</p>
        </>
      )}
    </section>
  );
}
