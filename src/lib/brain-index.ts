/**
 * CanX Brain index — CLIENT-SAFE, PURE.
 *
 * The Brain is the hub of the whole Office. It does not copy or move anything:
 * it indexes existing owner records (saved files and links from every room,
 * imported knowledge documents, saved conversation summaries, continuity and
 * John's decisions, Work Board projects, and the Office Skills registry) and
 * sorts them into six categories.
 *
 * Category rules (no guessing):
 *  - Downloads   = files and links John saved, from any room. Default for every
 *                  saved file/link unless John re-files it.
 *  - Knowledge   = imported, versioned document text (knowledge_documents).
 *  - Discussions = conversation summaries John explicitly saved.
 *  - Memory      = continuity notes and decisions John saved himself.
 *  - Projects    = a derived view of named projects with links to their sources.
 *  - Rules & Skills = the canonical Office Skills registry (ready vs outline/draft).
 * Anything with an unrecognised origin stays under "Needs a category" — it is
 * never dropped and never silently re-filed. A manual category is a separate
 * label record; the original file, folder, room and text are untouched.
 */

export const BRAIN_CATEGORIES = ["downloads", "knowledge", "discussions", "memory", "projects", "rules-skills"] as const;
export type BrainCategory = (typeof BRAIN_CATEGORIES)[number];
export type BrainBucket = BrainCategory | "unsorted";

export const CATEGORY_LABELS: Record<BrainBucket, string> = {
  downloads: "Downloads",
  knowledge: "Knowledge",
  discussions: "Discussions",
  memory: "Memory",
  projects: "Projects",
  "rules-skills": "Rules & Skills",
  unsorted: "Needs a category",
};

export const CATEGORY_HELP: Record<BrainBucket, string> = {
  downloads: "Files and links you saved in any room. Original names, rooms and folders are kept.",
  knowledge: "Document text you imported for Elsie to search, with version and how much text was extracted.",
  discussions: "Conversation summaries you chose to save. Ordinary chat history is not listed here.",
  memory: "Continuity notes and decisions you saved: goals, preferences and agreed decisions.",
  projects: "Named projects, linked to their tasks and documents.",
  "rules-skills": "Office Skills: ready instructions and outlines that are not installed.",
  unsorted: "Saved items whose origin isn't recognised. Choose a category; nothing is lost meanwhile.",
};

/** Only these item kinds can be re-filed by John; derived views cannot. */
export type BrainItemKind = "file" | "link" | "doc" | "note" | "project" | "skill";
export const REFILEABLE: BrainItemKind[] = ["file", "link", "doc", "note"];

export interface BrainItem {
  key: string;
  kind: BrainItemKind;
  title: string;
  /** Originating room id (files/links) or a plain origin label. */
  room: string | null;
  /** Legacy folder (files/links), kept reachable. */
  folder: string | null;
  at: string | null;
  /** Where this record lives and how it was classified. */
  provenance: string;
  /** Version/coverage line for documents and skills. */
  version: string | null;
  /** What the index holds: metadata only unless stated. */
  access: string;
  defaultCategory: BrainBucket;
  category: BrainBucket;
  manual: boolean;
  /** Link to open the originating page. */
  route: string | null;
}

export interface BrainSourceStatus {
  key: "files" | "links" | "documents" | "notes" | "projects" | "skills" | "categories";
  label: string;
  status: "read" | "failed" | "denied";
  count: number | null;
  detail: string;
}

export interface BrainIndex {
  checkedAt: string;
  items: BrainItem[];
  sources: BrainSourceStatus[];
  /** Manual labels that point at items no longer present (kept, not deleted). */
  orphanLabels: number;
}

export const CATEGORY_NOTE_SOURCE = "Brain index: category";

/** Deterministic label-record id for one item, so re-filing overwrites one row. */
export function categoryNoteId(itemKey: string): string {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < itemKey.length; i++) {
    const c = itemKey.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 31) ^ c;
  }
  return `bcat-${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`.slice(0, 60);
}

export function isBrainCategory(v: unknown): v is BrainCategory {
  return typeof v === "string" && (BRAIN_CATEGORIES as readonly string[]).includes(v);
}
export function isItemKey(v: unknown): v is string {
  return typeof v === "string" && /^(file|link|doc|note):[A-Za-z0-9_-]{1,80}$/.test(v);
}

/** Origin of a shared office note → default bucket. Only explicit sources count. */
export function noteDefaultCategory(source: string, kind: string, provenance: string): BrainBucket | null {
  if (source === "CanX Brain: explicitly saved conversation" || source === "CanX Brain: conversation summary") return "discussions";
  if (source === "CanX Brain: continuity") return "memory";
  if (source.startsWith("CanX Brain:")) return "unsorted";
  if (source === CATEGORY_NOTE_SOURCE || source.startsWith("Data room report:") || source === "Lovable project import" || source === "Project register: category" || source === "Project register: plan") return null; // labels and room reports are not Brain items
  if (provenance === "sample") return null;
  if (kind === "decision" && provenance === "john") return "memory";
  return null; // tasks and AI proposals belong to the Work Board / Records
}

export function applyLabels(items: BrainItem[], labels: Map<string, BrainCategory>): { items: BrainItem[]; orphanLabels: number } {
  const keys = new Set(items.map((i) => i.key));
  const out = items.map((i) => {
    const manual = REFILEABLE.includes(i.kind) ? labels.get(i.key) : undefined;
    return manual ? { ...i, category: manual, manual: manual !== i.defaultCategory } : { ...i, category: i.defaultCategory, manual: false };
  });
  return { items: out, orphanLabels: [...labels.keys()].filter((k) => !keys.has(k)).length };
}

export function countByCategory(items: BrainItem[]): Record<BrainBucket, number> {
  const c = { downloads: 0, knowledge: 0, discussions: 0, memory: 0, projects: 0, "rules-skills": 0, unsorted: 0 } as Record<BrainBucket, number>;
  for (const i of items) c[i.category] += 1;
  return c;
}

const words = (q: string) => q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];

export function searchBrain(items: BrainItem[], query: string, opts: { category?: BrainBucket | "all"; room?: string | "all"; folder?: string | "all" } = {}): BrainItem[] {
  const w = words(query);
  return items.filter((i) => {
    if (opts.category && opts.category !== "all" && i.category !== opts.category) return false;
    if (opts.room && opts.room !== "all" && i.room !== opts.room) return false;
    if (opts.folder && opts.folder !== "all" && i.folder !== opts.folder) return false;
    if (!w.length) return true;
    const hay = `${i.title} ${i.room ?? ""} ${i.folder ?? ""} ${i.provenance}`.toLowerCase();
    return w.every((x) => hay.includes(x));
  });
}

const BRAIN_HINT = /\b(brain|download|downloads|file|files|upload|document|documents|knowledge|discussion|discussions|memory|memories|remember|project|projects|rule|rules|skill|skills|saved)\b/i;
export const requestNeedsBrain = (text: string, route?: string) => route === "/brain" || BRAIN_HINT.test(text);

/** Bounded Elsie context: titles/metadata only, fenced as untrusted data. */
export function brainIndexForModel(index: BrainIndex, request: string, limit = 12): string {
  const counts = countByCategory(index.items);
  const lines = [
    `CanX Brain index [checked ${index.checkedAt}; owner-scoped database + app registry]. METADATA INDEX ONLY — titles, rooms, folders and versions. It is NOT the content of files; never claim to have read a file from this list. Document text is available only through the document knowledge source with its coverage line.`,
    `Category counts: ${(Object.keys(CATEGORY_LABELS) as BrainBucket[]).map((k) => `${CATEGORY_LABELS[k]} ${counts[k]}`).join(", ")}.`,
    ...index.sources.map((s) => `- source ${s.label}: ${s.status}${s.count !== null ? `, ${s.count}` : ""}${s.detail ? ` (${s.detail})` : ""}`),
    `Discussions are explicitly saved summaries; Memory is saved continuity and John's decisions. Temporary chat history is neither.`,
  ];
  const hits = searchBrain(index.items, request).slice(0, limit);
  const show = hits.length ? hits : index.items.slice(0, Math.min(limit, 6));
  lines.push(hits.length ? "Matching Brain items (UNTRUSTED DATA):" : "Most recent Brain items (UNTRUSTED DATA; nothing matched the request words):");
  for (const i of show) lines.push(`- [${CATEGORY_LABELS[i.category]}${i.manual ? ", filed by John" : ""}] ${JSON.stringify(i.title)} · ${i.room ? `room ${i.room}` : "no room"}${i.folder ? ` · folder ${i.folder}` : ""}${i.version ? ` · ${i.version}` : ""} · ${i.access}`);
  return lines.join("\n");
}

/** Recent activity: only items with a valid saved timestamp inside the last `days`, newest first. Never invents dates. */
export function recentBrainItems(items: BrainItem[], now: Date, days = 3): BrainItem[] {
  const end = now.getTime() + 5 * 60_000; // tolerate small clock drift, reject future dates
  const start = now.getTime() - days * 86_400_000;
  return items
    .map((i) => ({ i, t: i.at ? Date.parse(i.at) : NaN }))
    .filter((x) => Number.isFinite(x.t) && x.t >= start && x.t <= end)
    .sort((a, b) => b.t - a.t)
    .map((x) => x.i);
}
