/**
 * Project register — CLIENT-SAFE, PURE.
 *
 * Built only from SAVED owner records in office_notes with source exactly
 * "Lovable project import" (one per real project, id "lovable-project:<uuid>").
 * Nothing is seeded here. The import record is never rewritten by the app: a
 * category change is a separate label record, so the imported metadata stays
 * byte-for-byte as saved. Unknown providers/fields are kept as "unknown",
 * never guessed. A registry entry says nothing about whether the project's
 * own app or data is healthy or connected.
 */

export const PROJECT_IMPORT_SOURCE = "Lovable project import";
export const PROJECT_CATEGORY_SOURCE = "Project register: category";
export const PROJECT_CATEGORIES = [
  "Highway Safety", "Books & Publishing", "Video & Creative", "Office & Administration",
  "Ideas & Research", "Travel & Storytelling", "Wellbeing", "Other",
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export interface RegisteredProject {
  recordId: string;
  projectId: string;
  provider: string;
  workspaceId: string | null;
  name: string;
  description: string;
  importedCategory: string;
  categoryBasis: string;
  category: string;
  categoryManual: boolean;
  room: string;
  editorUrl: string | null;
  previewUrl: string | null;
  liveUrl: string | null;
  githubUrl: string | null;
  published: boolean | null;
  latestCommit: string | null;
  health: string;
  liveDataAccess: string;
  sourceCheckedOn: string | null;
  checkedAt: string | null;
  /** Problems reading this record's saved detail; shown, never hidden. */
  issues: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
/** Only https links on known hosts are made clickable. */
export function safeUrl(v: unknown, hosts: RegExp): string | null {
  const raw = s(v, 400);
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === "https:" && hosts.test(u.hostname) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const LOVABLE_HOST = /(^|\.)lovable\.(dev|app)$/i;
const ANY_HOST = /./;
const GITHUB_HOST = /^github\.com$/i;

export const projectCategoryNoteId = (projectId: string) => `pcat-${projectId}`.slice(0, 60);

export function parseProjectRecord(row: { id: unknown; title?: unknown; detail: unknown; source: unknown }): RegisteredProject | null {
  if (row.source !== PROJECT_IMPORT_SOURCE) return null;
  const recordId = s(row.id, 80);
  const issues: string[] = [];
  let d: Record<string, unknown> = {};
  try { const parsed = JSON.parse(typeof row.detail === "string" ? row.detail : ""); if (parsed && typeof parsed === "object") d = parsed as Record<string, unknown>; else issues.push("saved detail is not an object"); }
  catch { issues.push("saved detail could not be read"); }
  const fromId = recordId.startsWith("lovable-project:") ? recordId.slice(16) : "";
  const projectId = UUID.test(s(d["projectId"], 40)) ? s(d["projectId"], 40) : UUID.test(fromId) ? fromId : "";
  if (!projectId) return null; // no stable identity → not a register entry (record itself is untouched)
  if (fromId && fromId !== projectId) issues.push("record id and project id differ");
  const provider = s(d["provider"], 40) || "unknown";
  if (provider !== "Lovable") issues.push(`provider "${provider}" is not recognised; links are not opened`);
  const known = provider === "Lovable";
  const cat = s(d["category"], 60) || "Other";
  if (d["version"] !== 1) issues.push("unrecognised record version");
  return {
    recordId, projectId, provider,
    workspaceId: s(d["workspaceId"], 40) || null,
    name: s(d["name"], 160) || s(row.title, 160) || "(unnamed project)",
    description: s(d["description"], 1200),
    importedCategory: cat, categoryBasis: s(d["categoryBasis"], 200) || "unknown", category: cat, categoryManual: false,
    room: s(d["room"], 60) || "/projects",
    editorUrl: known ? safeUrl(d["editorUrl"], LOVABLE_HOST) : null,
    previewUrl: known ? safeUrl(d["previewUrl"], LOVABLE_HOST) : null,
    liveUrl: safeUrl(d["liveUrl"], ANY_HOST),
    githubUrl: safeUrl(d["githubUrl"], GITHUB_HOST),
    published: typeof d["published"] === "boolean" ? d["published"] : null,
    latestCommit: /^[0-9a-f]{7,40}$/i.test(s(d["latestCommit"], 40)) ? s(d["latestCommit"], 40) : null,
    health: s(d["health"], 60) || "Not tested",
    liveDataAccess: s(d["liveDataAccess"], 60) || "Not connected",
    sourceCheckedOn: s(d["sourceCheckedOn"], 20) || null,
    checkedAt: s(d["checkedAt"], 40) || null,
    issues,
  };
}

export function buildRegister(rows: Array<Record<string, unknown>>): { projects: RegisteredProject[]; orphanLabels: number } {
  const projects: RegisteredProject[] = [];
  const labels = new Map<string, string>();
  for (const r of rows) {
    if (r["source"] === PROJECT_CATEGORY_SOURCE) {
      const pid = s(r["title"], 40); const c = s(r["detail"], 60);
      if (UUID.test(pid) && (PROJECT_CATEGORIES as readonly string[]).includes(c) && !labels.has(pid)) labels.set(pid, c);
      continue;
    }
    const p = parseProjectRecord({ id: r["id"], title: r["title"], detail: r["detail"], source: r["source"] });
    if (p && !projects.some((x) => x.projectId === p.projectId)) projects.push(p);
  }
  const ids = new Set(projects.map((p) => p.projectId));
  for (const p of projects) { const l = labels.get(p.projectId); if (l && l !== p.importedCategory) { p.category = l; p.categoryManual = true; } }
  projects.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.projectId.localeCompare(b.projectId));
  return { projects, orphanLabels: [...labels.keys()].filter((k) => !ids.has(k)).length };
}

export function countProjectCategories(projects: RegisteredProject[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of projects) out[p.category] = (out[p.category] ?? 0) + 1;
  return out;
}

/** Bounded Elsie context. Names/descriptions are untrusted data. */
export function registerForModel(projects: RegisteredProject[], status: "read" | "failed" | "denied"): string {
  if (status !== "read") return `Project register: ${status === "denied" ? "needs two-step verification" : "could NOT be read"} for this request. Do not list John's projects.`;
  const counts = countProjectCategories(projects);
  return [
    `Project register [owner-saved records imported from Lovable; date checked per record]: ${projects.length} projects. Categories: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    "This is a register of metadata only. Health is 'Not tested' and live data 'Not connected' unless a record says otherwise; never claim a project's app works, is published live, or that its data is connected. Same names can be different projects — use the project ID.",
    ...projects.slice(0, 40).map((p) => `- ${JSON.stringify(p.name)} · ${p.category}${p.categoryManual ? " (filed by John)" : ""} · project ${p.projectId} · published flag ${p.published === null ? "unknown" : p.published ? "yes" : "no"} · live link ${p.liveUrl ? "recorded" : "unknown"} · health ${p.health} · data ${p.liveDataAccess} · checked ${p.sourceCheckedOn ?? "unknown"}`),
  ].join("\n");
}
