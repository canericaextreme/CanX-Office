/**
 * Brain index reader — SERVER ONLY. Read-only, through the owner's own token
 * (RLS applies). Each source reports read/failed/denied on its own; a failed
 * source is never shown as empty. Finance-room files and shared office notes
 * need two-step verification (AAL2), matching their existing app boundaries.
 */
import type { BackendConfig } from "./canx-backend.server";
import { OFFICE_SKILLS } from "./office-skills";
import { roomIdentityForRoute, OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import {
  CATEGORY_NOTE_SOURCE, applyLabels, isBrainCategory, noteDefaultCategory,
  type BrainCategory, type BrainIndex, type BrainItem, type BrainSourceStatus,
} from "./brain-index";

export type BrainRest = (config: BackendConfig, token: string, path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;
type Row = Record<string, unknown>;
const t = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const routeForRoom = (room: string) => OFFICE_ROOM_IDENTITIES.find((r) => r.id === room)?.route ?? null;

export async function readBrainIndexWith(input: { config: BackendConfig; token: string; aal: string; rest: BrainRest; now?: () => Date }): Promise<BrainIndex> {
  const { config, token, aal, rest } = input;
  const twoStep = aal === "aal2";
  const get = async (path: string): Promise<Row[] | null> => {
    const r = await rest(config, token, path).catch(() => null);
    return r?.ok && Array.isArray(r.body) ? (r.body as Row[]) : null;
  };
  const finFilter = twoStep ? "" : "&room=neq.finance";
  const [files, links, docs, notes, tasks] = await Promise.all([
    get(`office_files?select=id,filename,room,folder,mime_type,size_bytes,content_hash,created_at${finFilter}&order=created_at.desc&limit=500`),
    get(`office_links?select=id,title,room,folder,created_at${finFilter}&order=created_at.desc&limit=500`),
    get("knowledge_documents?select=id,title,project,filename,content_hash,character_count,chunk_count,created_at&order=created_at.desc&limit=200"),
    twoStep ? get("office_notes?select=id,kind,title,detail,source,provenance,created_at&order=created_at.desc&limit=1000") : Promise.resolve(null),
    get("manager_tasks?select=id,title,project,status,updated_at&order=updated_at.desc&limit=300"),
  ]);
  const items: BrainItem[] = [];
  const sources: BrainSourceStatus[] = [];
  const finNote = twoStep ? "" : "Finance room files hidden: needs two-step verification";
  /** Bounded reads: when a read hits its limit, the count is "shown / up to", not a total. */
  const cap = (list: Row[] | null, limit: number, extra = "") => [list && list.length >= limit ? `showing up to ${limit}; more may exist` : "", extra].filter(Boolean).join("; ");

  sources.push({ key: "files", label: "Saved files (across rooms)", status: files ? "read" : "failed", count: files?.length ?? null, detail: cap(files, 500, finNote) });
  for (const f of files ?? []) items.push({
    key: `file:${t(f["id"], 80)}`, kind: "file", title: t(f["filename"]) || "(unnamed file)", room: t(f["room"], 40) || null, folder: t(f["folder"], 60) || null,
    at: t(f["created_at"], 40) || null, provenance: "Saved file (office_files)", version: t(f["content_hash"], 64) ? `file ${t(f["content_hash"], 12)}` : null,
    access: "metadata only — open the file in its room", defaultCategory: "downloads", category: "downloads", manual: false, route: routeForRoom(t(f["room"], 40)),
  });
  sources.push({ key: "links", label: "Saved web links (across rooms)", status: links ? "read" : "failed", count: links?.length ?? null, detail: cap(links, 500, finNote) });
  for (const l of links ?? []) items.push({
    key: `link:${t(l["id"], 80)}`, kind: "link", title: t(l["title"]) || "(untitled link)", room: t(l["room"], 40) || null, folder: t(l["folder"], 60) || null,
    at: t(l["created_at"], 40) || null, provenance: "Saved web link (office_links)", version: null,
    access: "link only — the page was not downloaded", defaultCategory: "downloads", category: "downloads", manual: false, route: routeForRoom(t(l["room"], 40)),
  });
  sources.push({ key: "documents", label: "Imported document text", status: docs ? "read" : "failed", count: docs?.length ?? null, detail: cap(docs, 200, "metadata here; each document's own coverage (complete/partial) is stated when its text is searched") });
  for (const d of docs ?? []) items.push({
    key: `doc:${t(d["id"], 80)}`, kind: "doc", title: t(d["title"]) || t(d["filename"]), room: "brain", folder: null, at: t(d["created_at"], 40) || null,
    provenance: `Imported document ${t(d["filename"])}${t(d["project"]) ? ` · project ${t(d["project"], 80)}` : ""}`,
    version: `version ${t(d["content_hash"], 12)} · ${Number(d["chunk_count"]) || 0} sections · ${Number(d["character_count"]) || 0} characters (text only; pictures/layout not imported)`,
    access: "extracted text searchable by Elsie; coverage (complete or partial) is stated per answer, not assumed from this index", defaultCategory: "knowledge", category: "knowledge", manual: false, route: "/brain",
  });

  const labels = new Map<string, BrainCategory>();
  if (!twoStep) {
    sources.push({ key: "notes", label: "Saved summaries, continuity and decisions", status: "denied", count: null, detail: "needs two-step verification" });
    sources.push({ key: "categories", label: "Your manual categories", status: "denied", count: null, detail: "needs two-step verification" });
  } else {
    sources.push({ key: "notes", label: "Saved summaries, continuity and decisions", status: notes ? "read" : "failed", count: null, detail: "" });
    let n = 0, labelCount = 0;
    for (const r of notes ?? []) {
      const source = t(r["source"], 120);
      if (source === CATEGORY_NOTE_SOURCE) {
        const key = t(r["title"], 90); const cat = t(r["detail"], 20);
        if (isBrainCategory(cat) && !labels.has(key)) { labels.set(key, cat); labelCount++; }
        continue;
      }
      const def = noteDefaultCategory(source, t(r["kind"], 20), t(r["provenance"], 20));
      if (!def) continue;
      n++;
      items.push({
        key: `note:${t(r["id"], 80)}`, kind: "note", title: t(r["title"]) || "(untitled)", room: null, folder: null, at: t(r["created_at"], 40) || null,
        provenance: `${source || "John"} (office_notes)`, version: null, access: "saved record text", defaultCategory: def, category: def, manual: false, route: "/records",
      });
    }
    sources[sources.length - 1]!.count = notes ? n : null;
    sources[sources.length - 1]!.detail = cap(notes, 1000, notes && notes.length >= 1000 ? "older notes and their category labels may not be included" : "");
    sources.push({ key: "categories", label: "Your manual categories", status: notes ? "read" : "failed", count: notes ? labelCount : null, detail: "" });
  }

  // Projects: the owner's saved project register (imported records), then names on tasks/documents.
  if (twoStep && notes) {
    const { buildRegister } = await import("./project-register");
    const { plansFromRows, locate, tasksFromRows } = await import("./project-locator");
    const reg = buildRegister(notes);
    const plans = plansFromRows(notes);
    const taskRows = tasks ? tasksFromRows(tasks) : null;
    sources.push({ key: "projects", label: "Project register (saved Lovable project records)", status: "read", count: reg.projects.length, detail: "metadata as checked on each record's date; projects themselves untouched" });
    for (const p of reg.projects) items.push({
      key: `project:${p.projectId}`, kind: "project", title: p.name, room: "project-rooms", folder: p.category, at: p.sourceCheckedOn,
      provenance: `${p.provider} project register · category ${p.category}${p.categoryManual ? " (filed by John)" : ""}`, version: p.latestCommit ? `commit ${p.latestCommit.slice(0, 7)}` : null,
      access: (() => { const l = locate(p, plans.get(p.projectId), taskRows); return `register entry · stage ${l.stage} · next: ${l.nextMove.slice(0, 100)} · health ${p.health} · live data ${p.liveDataAccess}`; })(), defaultCategory: "projects", category: "projects", manual: false, route: "/projects",
    });
  } else if (!twoStep) sources.push({ key: "projects", label: "Project register (saved Lovable project records)", status: "denied", count: null, detail: "needs two-step verification" });
  // Projects: a derived view from explicit project names on tasks and documents.
  const projects = new Map<string, { tasks: number; docs: number; at: string }>();
  for (const r of tasks ?? []) { const p = t(r["project"], 120); if (!p) continue; const e = projects.get(p) ?? { tasks: 0, docs: 0, at: "" }; e.tasks++; e.at = e.at || t(r["updated_at"], 40); projects.set(p, e); }
  for (const d of docs ?? []) { const p = t(d["project"], 120); if (!p) continue; const e = projects.get(p) ?? { tasks: 0, docs: 0, at: "" }; e.docs++; e.at = e.at || t(d["created_at"], 40); projects.set(p, e); }
  sources.push({ key: "projects", label: "Project names on tasks and documents", status: tasks ? "read" : "failed", count: projects.size, detail: tasks ? cap(tasks, 300) : "Work Board tasks could not be read; only document projects shown" });
  for (const [name, e] of projects) items.push({
    key: `project:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`, kind: "project", title: name, room: "project-rooms", folder: null, at: e.at || null,
    provenance: `Derived from ${e.tasks} Work Board task(s) and ${e.docs} document(s)`, version: null, access: "links to its tasks and documents",
    defaultCategory: "projects", category: "projects", manual: false, route: roomIdentityForRoute("/work-board") ? "/work-board" : null,
  });

  // Rules & Skills: static, versioned app registry — never live operational data.
  sources.push({ key: "skills", label: "Office Skills registry (app setup)", status: "read", count: OFFICE_SKILLS.length, detail: "built into the app; not live data" });
  for (const s of OFFICE_SKILLS) items.push({
    key: `skill:${s.id}`, kind: "skill", title: s.name, room: null, folder: null, at: null, provenance: "Office Skills registry (app setup)",
    version: `v${s.version} · ${s.instructionReady ? "installed instructions" : s.kind === "reserved" || s.kind === "legacy" ? s.kind : `parked ${s.kind}`}`,
    access: "instructions on the Office Skills page", defaultCategory: "rules-skills", category: "rules-skills", manual: false, route: `/skills#${s.id}`,
  });

  const applied = applyLabels(items, labels);
  return { checkedAt: (input.now?.() ?? new Date()).toISOString(), items: applied.items, sources, orphanLabels: applied.orphanLabels };
}
