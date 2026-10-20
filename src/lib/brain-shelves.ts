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
export const SHELF_DISPLAY: Record<
  BrainShelf,
  { name: string; colourName: string; ink: string; guide: string }
> = {
  compass: {
    name: "The Compass",
    colourName: "Yellow",
    ink: "#111827",
    guide: "Who I am and where I am heading, goals and style.",
  },
  rulebook: { name: "The Rulebook", colourName: "Red", ink: "#FFFFFF", guide: "Standing rules." },
  workshop: {
    name: "The Workshop",
    colourName: "Green",
    ink: "#FFFFFF",
    guide: "Projects and apps.",
  },
  "piggy-bank": {
    name: "The Piggy Bank",
    colourName: "Orange",
    ink: "#111827",
    guide: "Costs, receipts, subscriptions.",
  },
  library: {
    name: "The Library",
    colourName: "Blue",
    ink: "#FFFFFF",
    guide: "Documents and files.",
  },
  diary: {
    name: "The Diary",
    colourName: "Purple",
    ink: "#FFFFFF",
    guide: "Conversation records.",
  },
  logbook: {
    name: "The Logbook",
    colourName: "Light grey",
    ink: "#111827",
    guide: "Build and connection history.",
  },
  "lost-and-found": {
    name: "The Lost-and-Found",
    colourName: "Dark grey",
    ink: "#FFFFFF",
    guide: "Open problems and duplicates.",
  },
};
/**
 * Who's who in the Office, as it works today (updated 19 Oct 2026 at John's
 * request; first named in brain-map-20261008 part 4). `workers` are the
 * Work Board team-member names whose tasks belong to each person, for the
 * live "Now:" line.
 */
export const BRAIN_CAST: readonly {
  who: string;
  role: string;
  does: string;
  workers: readonly string[];
}[] = [
  {
    who: "Elsie",
    role: "Office Manager",
    does: "Takes your instructions, sends work to the right room or builder, tracks it, and advises on what to approve or archive. She doesn't code, build, merge or publish.",
    workers: ["elsie", "astra", "office manager"],
  },
  {
    who: "ChatGPT",
    role: "Builder (the default)",
    does: "Builds Office changes through Codex unless you name Claude.",
    workers: ["chatgpt", "codex"],
  },
  {
    who: "Claude",
    role: "Builder and reviewer",
    does: "Builds when you name Claude, and checks work before you approve it.",
    workers: ["claude"],
  },
  {
    who: "Brain",
    role: "Shared memory and live logbook",
    does: "Keeps notes, documents and a record of every move. Elsie, Claude and ChatGPT all read it.",
    workers: [],
  },
  {
    who: "Build workshop",
    role: "Draft changes on GitHub",
    does: "Turns approved requests into tested draft changes. Nothing goes live until you approve it.",
    workers: [],
  },
];
/** Short overview from readable shelf metadata, never title or body guesses. */
export function shelfSynopsis(
  items: BrainItem[],
  shelf: BrainShelf,
  readable: boolean,
  sources: BrainIndex["sources"] = [],
): string {
  if (!readable)
    return "On this shelf you will find saved material once its filing can be read. The contents are currently unavailable.";
  const partial = sources.some((source) => source.status !== "read");
  const here = items.filter((item) => itemShelf(item) === shelf);
  if (!here.length)
    return partial
      ? "On this shelf you will find no saved material in the records currently available. Some sources could not be read, so other contents may be missing."
      : "On this shelf you will find no saved material yet.";
  const descriptions = [
    ...new Set(
      here.map((item) => {
        if (item.kind === "memory" || item.kind === "note") {
          switch (item.shelfOrigin) {
            case "goal":
              return "saved goals";
            case "profile":
              return "saved personal preferences";
            case "standing_rule":
              return "agreed rules";
            case "project_context":
              return "saved project notes";
            case "summary":
            case "CanX Brain: conversation summary":
              return "saved conversation summaries";
            case "CanX Brain: explicitly saved conversation":
              return "saved conversations";
            case "CanX Brain: build history":
              return "saved build history";
            case "CanX Brain: connection history":
              return "saved connection history";
          }
        }
        const words: Record<BrainItem["kind"], string> = {
          file: "saved files",
          link: "saved links",
          doc: "imported documents",
          note: "saved notes",
          project: "project records",
          skill: "Office Skills",
          memory: "saved memories",
        };
        return words[item.kind];
      }),
    ),
  ];
  const contents =
    descriptions.length === 1
      ? descriptions[0]
      : descriptions.slice(0, -1).join(", ") + " and " + descriptions.at(-1);
  const purpose: Record<BrainShelf, string> = {
    compass: "help you revisit your direction and working preferences",
    rulebook: "help you refer back to the guidance for Office work",
    workshop: "help you find material filed with your project work",
    "piggy-bank": "help you find material filed with your finances",
    library: "keep reference material easy to find and return to",
    diary: "help you return to what you chose to remember",
    logbook: "help you look back over Office work and changes",
    "lost-and-found": "help you review material that still needs a clear home",
  };
  return `On this shelf you will find ${contents}, gathered here to ${purpose[shelf]}. ${
    partial
      ? "Some sources could not be read, so this overview may be incomplete."
      : "This overview uses saved record details rather than the full contents."
  }`;
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
