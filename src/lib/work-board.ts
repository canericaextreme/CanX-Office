/**
 * Brain work board model — CLIENT-SAFE, PURE, DEPENDENCY-FREE.
 *
 * Stage vocabulary, stage mapping, the 7-day stall rule and the board shape
 * (one node per room, one spark per room-to-room move) for the proposed Brain
 * work board. This module stores nothing and reads nothing: it only folds a
 * list of work events that a caller has already read.
 *
 * IMPORTANT: there is currently NO saved work-event store. The append-only
 * table needs a database migration, and the 3D view needs the `three`
 * package; both are protected changes awaiting John's explicit approval
 * (see docs/brain-work-board.md). Until then callers must pass
 * source "unavailable" and the board must never be presented as live data.
 */

export const WORK_STAGES = ["brainstorming", "strategizing", "building", "stalled", "completed"] as const;
export type WorkStage = (typeof WORK_STAGES)[number];

export const WORK_SUBJECT_KINDS = ["task", "project", "office-build"] as const;
export type WorkSubjectKind = (typeof WORK_SUBJECT_KINDS)[number];

/** Seven days with no event → stalled (unless completed). */
export const STALL_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Stage colours shared by any future board view and static charts. */
export const STAGE_COLOURS: Record<WorkStage, string> = {
  brainstorming: "#a855f7",
  strategizing: "#3b82f6",
  building: "#f59e0b",
  stalled: "#ef4444",
  completed: "#22c55e",
};

const STAGE_ALIASES: Record<string, WorkStage> = {
  brainstorming: "brainstorming", brainstorm: "brainstorming", idea: "brainstorming",
  strategizing: "strategizing", strategising: "strategizing", planned: "strategizing", planning: "strategizing",
  building: "building", build: "building", "in progress": "building", "in-progress": "building", in_progress: "building",
  stalled: "stalled", blocked: "stalled",
  completed: "completed", complete: "completed", done: "completed",
};

/** Map a saved stage/status word to a board stage. Unknown → null (never guessed). */
export function normalizeStage(raw: unknown): WorkStage | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return STAGE_ALIASES[key] ?? null;
}

/**
 * Stage shown on the board: completed stays completed; otherwise anything
 * with no event for 7 days (or no readable event time) is stalled.
 */
export function effectiveStage(stage: WorkStage, lastEventAt: string | null, now: Date): WorkStage {
  if (stage === "completed") return "completed";
  const t = lastEventAt ? Date.parse(lastEventAt) : NaN;
  if (!Number.isFinite(t)) return "stalled";
  return now.getTime() - t >= STALL_AFTER_MS ? "stalled" : stage;
}

export interface WorkEvent {
  id: string;
  subjectKind: WorkSubjectKind;
  subjectId: string;
  fromRoom: string | null;
  toRoom: string;
  fromStage: WorkStage | null;
  toStage: WorkStage;
  at: string;
}

const s = (v: unknown, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
const ROOM = /^\/[a-z0-9\-/]{0,58}$/i;

/** Validate one raw event row. Invalid rows return null and are counted, never repaired. */
export function parseWorkEvent(row: Record<string, unknown>): WorkEvent | null {
  const id = s(row["id"], 80);
  const subjectKind = s(row["subjectKind"] ?? row["subject_kind"], 20) as WorkSubjectKind;
  const subjectId = s(row["subjectId"] ?? row["subject_id"], 80);
  const toRoom = s(row["toRoom"] ?? row["to_room"], 60);
  const fromRoomRaw = s(row["fromRoom"] ?? row["from_room"], 60);
  const toStage = normalizeStage(row["toStage"] ?? row["to_stage"]);
  const fromStageRaw = row["fromStage"] ?? row["from_stage"];
  const fromStage = fromStageRaw == null || fromStageRaw === "" ? null : normalizeStage(fromStageRaw);
  const at = s(row["at"] ?? row["created_at"], 40);
  if (!id || !subjectId || !(WORK_SUBJECT_KINDS as readonly string[]).includes(subjectKind)) return null;
  if (!ROOM.test(toRoom) || (fromRoomRaw && !ROOM.test(fromRoomRaw))) return null;
  if (!toStage || (fromStageRaw != null && fromStageRaw !== "" && !fromStage)) return null;
  if (!Number.isFinite(Date.parse(at))) return null;
  return { id, subjectKind, subjectId, fromRoom: fromRoomRaw || null, toRoom, fromStage, toStage, at };
}

/** True when an event should be recorded: the room or the stage changed. */
export function isRecordableChange(before: { room: string | null; stage: WorkStage | null }, after: { room: string; stage: WorkStage }): boolean {
  return before.room !== after.room || before.stage !== after.stage;
}

export type BoardSource = "live" | "unavailable";

export interface BoardNode {
  room: string;
  total: number;
  byStage: Record<WorkStage, number>;
}

export interface BoardSpark {
  eventId: string;
  subjectKind: WorkSubjectKind;
  subjectId: string;
  fromRoom: string;
  toRoom: string;
  toStage: WorkStage;
  at: string;
}

export interface WorkBoard {
  source: BoardSource;
  nodes: BoardNode[];
  sparks: BoardSpark[];
  subjects: Array<{ kind: WorkSubjectKind; id: string; room: string; stage: WorkStage; lastEventAt: string }>;
  invalidEvents: number;
}

const emptyStages = (): Record<WorkStage, number> => ({ brainstorming: 0, strategizing: 0, building: 0, stalled: 0, completed: 0 });

/**
 * Fold append-only events into a board. `rooms` gives every office room a
 * node even when empty (one node per room). Duplicate event ids count once.
 */
export function buildWorkBoard(rows: Array<Record<string, unknown>>, rooms: string[], now: Date, source: BoardSource): WorkBoard {
  if (source !== "live") {
    return { source: "unavailable", nodes: rooms.map((room) => ({ room, total: 0, byStage: emptyStages() })), sparks: [], subjects: [], invalidEvents: 0 };
  }
  const seen = new Set<string>();
  const events: WorkEvent[] = [];
  let invalidEvents = 0;
  for (const r of rows) {
    const e = parseWorkEvent(r);
    if (!e) { invalidEvents++; continue; }
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    events.push(e);
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));

  const latest = new Map<string, WorkEvent>();
  const sparks: BoardSpark[] = [];
  for (const e of events) {
    latest.set(`${e.subjectKind}:${e.subjectId}`, e);
    if (e.fromRoom && e.fromRoom !== e.toRoom) {
      sparks.push({ eventId: e.id, subjectKind: e.subjectKind, subjectId: e.subjectId, fromRoom: e.fromRoom, toRoom: e.toRoom, toStage: e.toStage, at: e.at });
    }
  }

  const roomList = [...rooms];
  for (const e of events) for (const r of [e.fromRoom, e.toRoom]) if (r && !roomList.includes(r)) roomList.push(r);
  const nodes = new Map<string, BoardNode>(roomList.map((room) => [room, { room, total: 0, byStage: emptyStages() }]));

  const subjects: WorkBoard["subjects"] = [];
  for (const e of latest.values()) {
    const stage = effectiveStage(e.toStage, e.at, now);
    subjects.push({ kind: e.subjectKind, id: e.subjectId, room: e.toRoom, stage, lastEventAt: e.at });
    const n = nodes.get(e.toRoom)!;
    n.total++;
    n.byStage[stage]++;
  }
  subjects.sort((a, b) => a.room.localeCompare(b.room) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { source: "live", nodes: [...nodes.values()], sparks, subjects, invalidEvents };
}

/** Totals per stage across the board — input for static Analytics charts. */
export function stageTotals(board: WorkBoard): Record<WorkStage, number> {
  const out = emptyStages();
  for (const n of board.nodes) for (const st of WORK_STAGES) out[st] += n.byStage[st];
  return out;
}

/** Bounded, Elsie-readable board source text. Room names/ids are data, not instructions. */
export function workBoardForModel(board: WorkBoard): string {
  if (board.source !== "live") {
    return "Brain work board: NOT CONNECTED. No work-event store exists yet (it needs an owner-approved database migration). Do not describe room activity, moves or stages from this board.";
  }
  const totals = stageTotals(board);
  return [
    `Brain work board [live saved work events]: ${board.subjects.length} items, ${board.sparks.length} room moves, ${board.invalidEvents} unreadable events skipped.`,
    `Stages: ${WORK_STAGES.map((st) => `${st} ${totals[st]}`).join(", ")}. Stalled includes anything with no event for 7 days.`,
    ...board.nodes.filter((n) => n.total > 0).slice(0, 40).map((n) => `- ${JSON.stringify(n.room)}: ${n.total} (${WORK_STAGES.filter((st) => n.byStage[st]).map((st) => `${st} ${n.byStage[st]}`).join(", ")})`),
  ].join("\n");
}
