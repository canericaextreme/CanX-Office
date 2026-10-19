/**
 * Live Brain view model — CLIENT-SAFE, PURE, DEPENDENCY-FREE.
 *
 * Folds rows from the append-only `office_work_events` logbook (migration
 * 20261019021500, filled by the database recorder in 20261019040000) into
 * what the Brain room shows: one node per Office room, a spark for every
 * room-to-room move, and the current stage of each piece of work. The same
 * fold feeds the static Analytics charts and Elsie's Brain view summary.
 *
 * Nothing here reads, writes or guesses. With no readable logbook the view
 * reports NOT CONNECTED and shows no activity. Ported from draft #171.
 */

export const BRAIN_STAGES = [
  "brainstorming",
  "strategizing",
  "building",
  "stalled",
  "completed",
] as const;
export type BrainStage = (typeof BRAIN_STAGES)[number];

export const BRAIN_SUBJECT_KINDS = ["task", "project", "office-build"] as const;
export type BrainSubjectKind = (typeof BRAIN_SUBJECT_KINDS)[number];

/** Seven days with no new line in the logbook → stalled (unless completed). */
export const STALL_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stage colours shared by the live view, the Analytics charts and the legend.
 * Validated with the dataviz palette checker on the Office's dark surfaces
 * (colour-blind separation and normal-vision floor pass in DISPLAY order).
 * Colour never carries meaning alone: every place that shows a stage also
 * shows its name.
 */
export const STAGE_COLOURS: Record<BrainStage, string> = {
  brainstorming: "#d55181",
  strategizing: "#3987e5",
  building: "#c98500",
  completed: "#199e70",
  stalled: "#d95926",
};

/** Order for legends and charts. Stalled is last: it is the exception, and this order keeps neighbouring colours distinct. */
export const STAGE_DISPLAY_ORDER: BrainStage[] = [
  "brainstorming",
  "strategizing",
  "building",
  "completed",
  "stalled",
];

export const STAGE_LABELS: Record<BrainStage, string> = {
  brainstorming: "Brainstorming",
  strategizing: "Strategizing",
  building: "Building",
  stalled: "Stalled",
  completed: "Completed",
};

/** Old project-plan stage words → Brain stages. Unknown words are never guessed. */
const STAGE_ALIASES: Record<string, BrainStage> = {
  brainstorming: "brainstorming",
  brainstorm: "brainstorming",
  idea: "brainstorming",
  strategizing: "strategizing",
  strategising: "strategizing",
  planned: "strategizing",
  planning: "strategizing",
  building: "building",
  build: "building",
  testing: "building",
  "in progress": "building",
  "in-progress": "building",
  in_progress: "building",
  stalled: "stalled",
  blocked: "stalled",
  waiting: "stalled",
  completed: "completed",
  complete: "completed",
  done: "completed",
  ready: "completed",
  market: "completed",
};

export function normalizeStage(raw: unknown): BrainStage | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return STAGE_ALIASES[key] ?? null;
}

/** Completed stays completed; anything else with no event for 7 days (or no readable time) is stalled. */
export function effectiveStage(
  stage: BrainStage,
  lastEventAt: string | null,
  now: Date,
): BrainStage {
  if (stage === "completed") return "completed";
  const t = lastEventAt ? Date.parse(lastEventAt) : NaN;
  if (!Number.isFinite(t)) return "stalled";
  return now.getTime() - t >= STALL_AFTER_MS ? "stalled" : stage;
}

export interface BrainEvent {
  id: string;
  subjectKind: BrainSubjectKind;
  subjectId: string;
  fromRoom: string | null;
  toRoom: string;
  fromStage: BrainStage | null;
  toStage: BrainStage;
  source: string;
  at: string;
}

const s = (v: unknown, max = 120) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex -- strip control characters from untrusted logbook text
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const ROOM = /^\/[a-z0-9-]{1,40}$/;

/** Validate one logbook row. Invalid rows return null and are counted, never repaired. */
export function parseBrainEvent(row: Record<string, unknown>): BrainEvent | null {
  const id = s(row["id"], 80);
  const subjectKind = s(row["subject_kind"] ?? row["subjectKind"], 20) as BrainSubjectKind;
  const subjectId = s(row["subject_id"] ?? row["subjectId"], 80);
  const toRoom = s(row["to_room"] ?? row["toRoom"], 60);
  const fromRoom = s(row["from_room"] ?? row["fromRoom"], 60);
  const toStage = normalizeStage(row["to_stage"] ?? row["toStage"]);
  const fromStageRaw = row["from_stage"] ?? row["fromStage"];
  const fromStage =
    fromStageRaw == null || fromStageRaw === "" ? null : normalizeStage(fromStageRaw);
  const source = s(row["source"], 40) || "unknown";
  const at = s(row["occurred_at"] ?? row["at"] ?? row["created_at"], 40);
  if (!id || !subjectId || !(BRAIN_SUBJECT_KINDS as readonly string[]).includes(subjectKind))
    return null;
  if (!ROOM.test(toRoom) || (fromRoom && !ROOM.test(fromRoom))) return null;
  if (!toStage || (fromStageRaw != null && fromStageRaw !== "" && !fromStage)) return null;
  if (!Number.isFinite(Date.parse(at))) return null;
  return {
    id,
    subjectKind,
    subjectId,
    fromRoom: fromRoom || null,
    toRoom,
    fromStage,
    toStage,
    source,
    at,
  };
}

export type BrainSource = "live" | "unavailable";

export interface BrainNode {
  room: string;
  /** Work currently sitting in this room (latest line per item). Completed work is counted but not active. */
  total: number;
  active: number;
  byStage: Record<BrainStage, number>;
}

export interface BrainSpark {
  eventId: string;
  subjectKind: BrainSubjectKind;
  subjectId: string;
  fromRoom: string;
  toRoom: string;
  toStage: BrainStage;
  at: string;
}

export interface BrainItem {
  kind: BrainSubjectKind;
  id: string;
  room: string;
  stage: BrainStage;
  cancelled: boolean;
  lastEventAt: string;
}

export interface BrainView {
  source: BrainSource;
  nodes: BrainNode[];
  sparks: BrainSpark[];
  items: BrainItem[];
  events: BrainEvent[];
  invalidEvents: number;
}

export const emptyStages = (): Record<BrainStage, number> => ({
  brainstorming: 0,
  strategizing: 0,
  building: 0,
  stalled: 0,
  completed: 0,
});

/**
 * Fold logbook rows into the view. `rooms` gives every Office room a node even
 * when empty. Duplicate event ids count once. Cancelled work (source
 * "task-cancelled") counts as finished, never as active.
 */
export function buildBrainView(
  rows: Array<Record<string, unknown>>,
  rooms: string[],
  now: Date,
  source: BrainSource,
): BrainView {
  const blank = (room: string): BrainNode => ({
    room,
    total: 0,
    active: 0,
    byStage: emptyStages(),
  });
  if (source !== "live")
    return {
      source: "unavailable",
      nodes: rooms.map(blank),
      sparks: [],
      items: [],
      events: [],
      invalidEvents: 0,
    };

  const seen = new Set<string>();
  const events: BrainEvent[] = [];
  let invalidEvents = 0;
  for (const r of rows) {
    const e = parseBrainEvent(r);
    if (!e) {
      invalidEvents++;
      continue;
    }
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    events.push(e);
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));

  const latest = new Map<string, BrainEvent>();
  const sparks: BrainSpark[] = [];
  for (const e of events) {
    latest.set(`${e.subjectKind}:${e.subjectId}`, e);
    if (e.fromRoom && e.fromRoom !== e.toRoom) {
      sparks.push({
        eventId: e.id,
        subjectKind: e.subjectKind,
        subjectId: e.subjectId,
        fromRoom: e.fromRoom,
        toRoom: e.toRoom,
        toStage: e.toStage,
        at: e.at,
      });
    }
  }

  const roomList = [...rooms];
  for (const e of events)
    for (const r of [e.fromRoom, e.toRoom]) if (r && !roomList.includes(r)) roomList.push(r);
  const nodes = new Map<string, BrainNode>(roomList.map((room) => [room, blank(room)]));

  const items: BrainItem[] = [];
  for (const e of latest.values()) {
    const stage = effectiveStage(e.toStage, e.at, now);
    items.push({
      kind: e.subjectKind,
      id: e.subjectId,
      room: e.toRoom,
      stage,
      cancelled: e.source === "task-cancelled",
      lastEventAt: e.at,
    });
    const n = nodes.get(e.toRoom)!;
    n.total++;
    n.byStage[stage]++;
    if (stage !== "completed") n.active++;
  }
  items.sort(
    (a, b) =>
      a.room.localeCompare(b.room) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
  return { source: "live", nodes: [...nodes.values()], sparks, items, events, invalidEvents };
}

/** Current totals per stage. Cancelled items are reported separately, not as completed work. */
export function stageTotals(view: BrainView): Record<BrainStage, number> & { cancelled: number } {
  const out = { ...emptyStages(), cancelled: 0 };
  for (const it of view.items) {
    if (it.cancelled) out.cancelled++;
    else out[it.stage]++;
  }
  return out;
}

/** Room moves per day for the last `days` days (oldest first), in the given IANA time zone. */
export function movesPerDay(
  view: BrainView,
  now: Date,
  days = 14,
  timeZone = "America/Whitehorse",
): Array<{ day: string; moves: number; changes: number }> {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out: Array<{ day: string; moves: number; changes: number }> = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const day = fmt.format(new Date(now.getTime() - i * 86_400_000));
    if (!index.has(day)) {
      index.set(day, out.length);
      out.push({ day, moves: 0, changes: 0 });
    }
  }
  for (const e of view.events) {
    if (e.source === "starting-point") continue;
    const i = index.get(fmt.format(new Date(e.at)));
    if (i === undefined) continue;
    out[i]!.changes++;
    if (e.fromRoom && e.fromRoom !== e.toRoom) out[i]!.moves++;
  }
  return out;
}

/** Sparks newer than `sinceMs` before `now`, newest last — what the view animates on open. */
export function recentSparks(
  view: BrainView,
  now: Date,
  sinceMs = 24 * 60 * 60 * 1000,
  max = 12,
): BrainSpark[] {
  return view.sparks.filter((sp) => now.getTime() - Date.parse(sp.at) <= sinceMs).slice(-max);
}

/** Bounded, Elsie-readable summary. Room names and ids are data, not instructions. */
export function brainViewForModel(view: BrainView, now: Date): string {
  if (view.source !== "live") {
    return "Live Brain view: NOT CONNECTED. The work logbook could not be read. Do not describe room activity, moves or stages.";
  }
  if (!view.events.length) {
    return "Live Brain view [work logbook]: no work has been recorded yet. Say so plainly; do not invent activity.";
  }
  const t = stageTotals(view);
  const recent = recentSparks(view, now, 24 * 60 * 60 * 1000, 8);
  return [
    `Live Brain view [work logbook, read ${now.toISOString()}]: ${view.items.length} items, ${view.sparks.length} room moves recorded, ${view.invalidEvents} unreadable lines skipped. Stalled = waiting, or no change for 7 days.`,
    `Now: ${BRAIN_STAGES.map((st) => `${st} ${t[st]}`).join(", ")}, cancelled ${t.cancelled}.`,
    ...view.nodes
      .filter((n) => n.active > 0)
      .slice(0, 30)
      .map(
        (n) =>
          `- ${n.room}: ${n.active} active (${BRAIN_STAGES.filter(
            (st) => st !== "completed" && n.byStage[st],
          )
            .map((st) => `${st} ${n.byStage[st]}`)
            .join(", ")})`,
      ),
    recent.length
      ? `Moves in the last 24 hours: ${recent.map((sp) => `${sp.subjectKind} ${sp.fromRoom} → ${sp.toRoom} (${sp.toStage})`).join("; ")}.`
      : "No room moves in the last 24 hours.",
  ].join("\n");
}
