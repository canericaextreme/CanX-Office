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
      (s) =>
        `${SHELF_LABELS[s]}: ${index.sources.some((x) => x.key === "shelves" && x.status !== "read") ? "filing unavailable; count unknown" : `${counts[s]} indexed items`}; ${shelfRoute(s)} — ${SHELF_HELP[s]}`,
    ),
    "Counts cover only readable indexed sources; failures, denied sources and read limits mean incomplete counts. Shelf filing needs owner two-step verification, compare-and-save and readback. Computer uploads preserve originals; filing is a separate confirmed save. Do not claim a shelf upload was filed until its label was re-read.",
  ];
}
