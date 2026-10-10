import type { BrainIndex, BrainItem } from "./brain-index";
import { sha256Hex } from "./sha256";

/** John's eight-shelf map. One registry serves Brain, snapshots and Elsie. */
export const BRAIN_SHELVES = [
  "compass",
  "rulebook",
  "workshop",
  "piggy-bank",
  "library",
  "diary",
  "logbook",
  "lost-and-found",
] as const;
export type BrainShelf = (typeof BRAIN_SHELVES)[number];
export const SHELF_LABELS: Record<BrainShelf, string> = {
  compass: "Compass",
  rulebook: "Rulebook",
  workshop: "Workshop",
  "piggy-bank": "Piggy Bank",
  library: "Library",
  diary: "Diary",
  logbook: "Logbook",
  "lost-and-found": "Lost-and-Found",
};
export const SHELF_HELP: Record<BrainShelf, string> = {
  compass: "Goals, direction and working preferences.",
  rulebook: "Agreed rules and the canonical Office Skills.",
  workshop: "Projects, apps and their work.",
  "piggy-bank": "Finance files, costs and subscriptions; existing Finance permissions apply.",
  library: "Original files, links and imported document text.",
  diary: "Saved conversations and summaries.",
  logbook: "Build and connection history.",
  "lost-and-found":
    "Unfiled records and unresolved issues. Review and file them without changing originals.",
};
export const SHELF_COLORS: Record<BrainShelf, string> = {
  compass: "#FACC15",
  rulebook: "#B91C1C",
  workshop: "#15803D",
  "piggy-bank": "#F97316",
  library: "#1D4ED8",
  diary: "#7E22CE",
  logbook: "#D1D5DB",
  "lost-and-found": "#374151",
};
/** Agreed display design (PR70 + brain-map-20261008): name, colour name, badge ink (>= 4.5:1) and one-line guide. */
export const SHELF_DISPLAY: Record<BrainShelf, { name: string; colourName: string; ink: string; guide: string }> = {
  compass: { name: "The Compass", colourName: "Yellow", ink: "#111827", guide: "Who I am and where I am heading, goals and style." },
  rulebook: { name: "The Rulebook", colourName: "Red", ink: "#FFFFFF", guide: "Standing rules." },
  workshop: { name: "The Workshop", colourName: "Green", ink: "#FFFFFF", guide: "Projects and apps." },
  "piggy-bank": { name: "The Piggy Bank", colourName: "Orange", ink: "#111827", guide: "Costs, receipts, subscriptions." },
  library: { name: "The Library", colourName: "Blue", ink: "#FFFFFF", guide: "Documents and files." },
  diary: { name: "The Diary", colourName: "Purple", ink: "#FFFFFF", guide: "Conversation records." },
  logbook: { name: "The Logbook", colourName: "Light grey", ink: "#111827", guide: "Build and connection history." },
  "lost-and-found": { name: "The Lost-and-Found", colourName: "Dark grey", ink: "#FFFFFF", guide: "Open problems and duplicates." },
};
/** The agreed cast, named as in brain-map-20261008 part 4. */
export const BRAIN_CAST: readonly { who: string; role: string }[] = [
  { who: "Elsie", role: "Front-Desk Manager" },
  { who: "ChatGPT", role: "the Drafter" },
  { who: "Claude", role: "the Second Pair of Eyes" },
  { who: "Brain", role: "the Memory Keeper" },
  { who: "Codex and Claude builders", role: "the Workshop Crew" },
];
/** Intended uses are distinct from metadata confirmed in the readable index. */
const SHELF_PURPOSE: Record<BrainShelf, string> = {
  compass: "goals, direction and working preferences to help the Office team plan in John's style",
  rulebook: "working instructions, agreed rules and saved guidance used by the Office team, including canonical Office Skills",
  workshop: "projects, apps and their work to support planning and building",
  "piggy-bank": "costs, receipts and subscriptions to support financial review under existing Finance permissions",
  library: "documents, original files, links and imported text to consult and reuse",
  diary: "saved conversations and summaries to revisit decisions and context",
  logbook: "build and connection history to trace changes and follow up on outcomes",
  "lost-and-found": "unfiled records, open problems and duplicates to review and file without changing originals",
};

export function shelfSynopsis(
  items: BrainItem[], shelf: BrainShelf, readable: boolean, incomplete = false,
): string {
  const purpose = `On this shelf you will find... This shelf is intended for ${SHELF_PURPOSE[shelf]}.`;
  if (!readable)
    return `${purpose} Current contents are unknown and the count is unknown because shelf labels could not be read.`;
  const here = items.filter((i) => itemShelf(i) === shelf && i.shelfReadable !== false);
  const coverage = incomplete
    ? " Some sources are unavailable or limited; this is only the readable index."
    : " This describes indexed metadata, not a review of the originals.";
  if (here.length === 0)
    return `${purpose} Nothing is filed here yet in the readable index.${coverage}`;
  // Titles are evidence of subjects, not a basis for classification or claims about file contents.
  const titles = [...new Set(here.map((i) => i.title.replace(/\s+/g, " ").trim()).filter(Boolean))]
    .slice(0, 3).map((title) => `“${title.length > 80 ? title.slice(0, 77) + "…" : title}”`);
  const confirmed = titles.length
    ? ` Currently indexed here: ${titles.join("; ")}${here.length > titles.length ? "; and other records" : ""}.`
    : " Records are indexed here, but their subjects are not available in the metadata.";
  return `${purpose}${confirmed} ${here.length} indexed item${here.length === 1 ? "" : "s"}.${coverage}`;
}
export const SHELF_SOURCE = "Brain shelf: filing";
export const shelfNoteId = (key: string) => `bshelf-${sha256Hex(key)}`;
export const isBrainShelf = (v: unknown): v is BrainShelf =>
  typeof v === "string" && (BRAIN_SHELVES as readonly string[]).includes(v);
export const shelfRoute = (shelf: BrainShelf) => `/brain#shelf-${shelf}`;
export const shelfFromHash = (hash: string): BrainShelf | null =>
  BRAIN_SHELVES.find((s) => hash === `#shelf-${s}`) ?? null;
export interface ShelfFiling {
  version: 1;
  itemKey: string;
  shelf: BrainShelf;
}
export function parseShelfFiling(value: unknown): ShelfFiling | null {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    return v?.version === 1 && isShelfItemKey(v.itemKey) && isBrainShelf(v.shelf) ? v : null;
  } catch {
    return null;
  }
}
export const isShelfItemKey = (v: unknown): v is string =>
  typeof v === "string" && /^(file|link|doc|note|memory|summary):[A-Za-z0-9_-]{1,80}$/.test(v);

/** No title/keyword classification and no conversion of legacy category labels.
 * These defaults use record types or exact saved origin; ambiguous notes stay unfiled. */
export function defaultShelf(item: BrainItem): BrainShelf {
  if (item.kind === "project") return "workshop";
  if (item.kind === "skill") return "rulebook";
  if (item.kind === "file" || item.kind === "link")
    return item.room === "finance" ? "piggy-bank" : "library";
  if (item.kind === "doc") return "library";
  if (item.shelfOrigin === "goal" || item.shelfOrigin === "profile") return "compass";
  if (item.shelfOrigin === "standing_rule") return "rulebook";
  if (item.shelfOrigin === "project_context") return "workshop";
  if (
    item.shelfOrigin === "summary" ||
    item.shelfOrigin === "CanX Brain: explicitly saved conversation" ||
    item.shelfOrigin === "CanX Brain: conversation summary"
  )
    return "diary";
  if (
    item.shelfOrigin === "CanX Brain: build history" ||
    item.shelfOrigin === "CanX Brain: connection history"
  )
    return "logbook";
  return "lost-and-found";
}
export const itemShelf = (item: BrainItem): BrainShelf => item.shelf ?? defaultShelf(item);
export function countByShelf(items: BrainItem[]): Record<BrainShelf, number> {
  const counts = Object.fromEntries(BRAIN_SHELVES.map((s) => [s, 0])) as Record<BrainShelf, number>;
  for (const item of items) counts[itemShelf(item)]++;
  return counts;
}
export function shelvesForModel(index: BrainIndex): string[] {
  const counts = countByShelf(index.items);
  return [
    "Brain Remodel uses eight shelves. Classification uses saved shelf labels or explicit record origin, never title guesses. Legacy category labels remain preserved separately.",
    ...BRAIN_SHELVES.map(
      (s, n) =>
        `Shelf ${n + 1}, ${SHELF_DISPLAY[s].name} (${SHELF_DISPLAY[s].colourName}, ${SHELF_COLORS[s]}) — also called ${SHELF_LABELS[s]}: ${index.sources.some((x) => x.key === "shelves" && x.status !== "read") ? "filing unavailable; count unknown" : `${counts[s]} indexed items`}; ${shelfRoute(s)} — ${SHELF_DISPLAY[s].guide} ${SHELF_HELP[s]}`,
    ),
    `Who's who: ${BRAIN_CAST.map((c) => `${c.who} is ${c.role}`).join("; ")}.`,
    "Counts cover only readable indexed sources; failures, denied sources and read limits mean incomplete counts. Shelf filing needs owner two-step verification, compare-and-save and readback. Computer uploads preserve originals; filing is a separate confirmed save. Do not claim a shelf upload was filed until its label was re-read.",
  ];
}
