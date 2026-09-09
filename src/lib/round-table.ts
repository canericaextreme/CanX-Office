/**
 * Monday round table — draft planning record.
 *
 * Not scheduled. No invitations, no calendar, no automated jobs.
 * Saved on this device only until a CanX-owned backend is configured.
 */

export interface AgendaItem {
  id: string;
  title: string;
  minutes: number;
  notes: string;
}

export interface RoleSeat {
  id: string;
  name: string;
  assignedTo: string;
  connected: boolean;
  note: string;
}

/** Where a meeting record came from. John's own entries are never "sample". */
export type RecordProvenance = "john" | "seed" | "imported" | "ai-proposal";

export const RECORD_PROVENANCE_LABELS: Record<RecordProvenance, string> = {
  john: "Entered by John",
  seed: "Draft starting point",
  imported: "Imported from a file",
  "ai-proposal": "Proposed by the Office Manager",
};

export interface DecisionRow {
  id: string;
  text: string;
  owner: string;
  due: string;
  provenance: RecordProvenance;
}

export interface ActionRow {
  id: string;
  text: string;
  owner: string;
  due: string;
  done: boolean;
  provenance: RecordProvenance;
}

export interface RoundTableDoc {
  version: 1;
  date: string;
  time: string;
  timezone: string;
  chair: string;
  coordinator: string;
  agenda: AgendaItem[];
  roles: RoleSeat[];
  notes: string;
  decisions: DecisionRow[];
  actions: ActionRow[];
  updatedAt: string;
}

export const MEETING_TIME = "17:00";
export const MEETING_TIMEZONE = "America/Dawson_Creek";

export const ROUND_TABLE_KEY = "canx-round-table-2026-09-14";

export const TIMEZONE_OPTIONS = [
  "America/Dawson_Creek",
  "America/Edmonton",
  "America/Vancouver",
  "America/Winnipeg",
  "America/Toronto",
  "UTC",
];

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function seedRoundTable(): RoundTableDoc {
  return {
    version: 1,
    date: "2026-09-14",
    time: MEETING_TIME,
    timezone: MEETING_TIMEZONE,
    chair: "John Cantlon",
    coordinator: "Office Manager",
    agenda: [
      { id: "ag-1", title: "Priorities", minutes: 5, notes: "" },
      { id: "ag-2", title: "Project updates and blockers", minutes: 10, notes: "" },
      { id: "ag-3", title: "Costs and risks", minutes: 5, notes: "" },
      { id: "ag-4", title: "Decisions", minutes: 5, notes: "" },
      { id: "ag-5", title: "Owners and dates", minutes: 5, notes: "" },
    ],
    roles: [
      { id: "r-1", name: "Project Coordinator", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-2", name: "Research & Standards", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-3", name: "Build & Integration", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-4", name: "Quality & Security", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-5", name: "Finance & Records", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-6", name: "Communications", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-7", name: "Legal & Compliance Support", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-8", name: "Design & Analytics", assignedTo: "", connected: false, note: "Planned role." },
      { id: "r-9", name: "Systems & Recovery", assignedTo: "", connected: false, note: "Planned role." },
      {
        id: "r-10",
        name: "Independent reviewer",
        assignedTo: "Claude (planned)",
        connected: false,
        note: "Not connected and not verified. Nothing in this office speaks as Claude.",
      },
    ],
    notes: [
      "Draft only. This meeting is not scheduled and no invitations exist.",
      "Start time is 5:00 pm, chosen by John. Timezone America/Dawson_Creek. Both stay editable.",
      "Seed content is limited to known planning facts. No live Safe Highways status is included.",
    ].join("\n"),
    decisions: [],
    actions: [],
    updatedAt: new Date().toISOString(),
  };
}

/* ---------------- validation (import is data only, never instructions) --------------- */

const str = (value: unknown, max = 4000) => (typeof value === "string" ? value.slice(0, max) : "");
const bool = (value: unknown) => value === true;
const num = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(600, Math.max(0, Math.round(value))) : fallback;
const arr = (value: unknown) => (Array.isArray(value) ? value.slice(0, 200) : []);

export function validateRoundTable(input: unknown): { doc: RoundTableDoc | null; error?: string } {
  if (!input || typeof input !== "object") return { doc: null, error: "The file is not a round table record." };
  const raw = input as Record<string, unknown>;
  if (raw["version"] !== 1) return { doc: null, error: "Unsupported file version. Expected version 1." };

  const seed = seedRoundTable();
  const doc: RoundTableDoc = {
    version: 1,
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(raw["date"], 10)) ? str(raw["date"], 10) : seed.date,
    // An older saved draft with no time adopts John's chosen 5:00 pm; every other field is kept.
    time: /^\d{2}:\d{2}$/.test(str(raw["time"], 5)) ? str(raw["time"], 5) : MEETING_TIME,
    timezone: TIMEZONE_OPTIONS.includes(str(raw["timezone"], 40)) ? str(raw["timezone"], 40) : seed.timezone,
    chair: str(raw["chair"], 120) || seed.chair,
    coordinator: str(raw["coordinator"], 120) || seed.coordinator,
    agenda: arr(raw["agenda"]).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: str(row["id"], 40) || newId(`ag-${index}`),
        title: str(row["title"], 200),
        minutes: num(row["minutes"], 5),
        notes: str(row["notes"], 4000),
      };
    }),
    roles: arr(raw["roles"]).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: str(row["id"], 40) || newId(`r-${index}`),
        name: str(row["name"], 160),
        assignedTo: str(row["assignedTo"], 160),
        connected: bool(row["connected"]),
        note: str(row["note"], 600),
      };
    }),
    notes: str(raw["notes"], 20000),
    decisions: arr(raw["decisions"]).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: str(row["id"], 40) || newId(`d-${index}`),
        text: str(row["text"], 1000),
        owner: str(row["owner"], 160),
        due: str(row["due"], 20),
        provenance: "imported" as RecordProvenance,
      };
    }),
    actions: arr(raw["actions"]).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: str(row["id"], 40) || newId(`a-${index}`),
        text: str(row["text"], 1000),
        owner: str(row["owner"], 160),
        due: str(row["due"], 20),
        done: bool(row["done"]),
        provenance: "imported" as RecordProvenance,
      };
    }),
    updatedAt: new Date().toISOString(),
  };

  if (!doc.agenda.length) doc.agenda = seed.agenda;
  if (!doc.roles.length) doc.roles = seed.roles;

  // Imported records can never claim a live connection.
  doc.roles = doc.roles.map((role) => ({ ...role, connected: false }));

  return { doc };
}

export function loadRoundTable(): RoundTableDoc {
  try {
    const raw = window.localStorage.getItem(ROUND_TABLE_KEY);
    if (!raw) return seedRoundTable();
    const { doc } = validateRoundTable(JSON.parse(raw));
    return doc ?? seedRoundTable();
  } catch {
    return seedRoundTable();
  }
}

export function saveRoundTable(doc: RoundTableDoc) {
  const next = { ...doc, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(ROUND_TABLE_KEY, JSON.stringify(next));
  return next;
}
