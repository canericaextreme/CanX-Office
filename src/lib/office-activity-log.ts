/**
 * Office activity log — genuine, office-triggered work only.
 *
 * A record is written here ONLY when the office actually starts a real piece of
 * work (today: a Claude second-eyes review that was genuinely submitted from
 * this device with a verified owner session). Nothing is invented, seeded or
 * simulated, and there is no demonstration mode.
 *
 * Storage is this device's browser storage until the CanX-owned backend is
 * connected, so records are clearly labelled device-only.
 */

import type { WorkEvent } from "./work-activity";

const KEY = "canx-office-activity";
const MAX_RECORDS = 40;

export const ACTIVITY_SOURCE = "CanX Office — this device";

export type ActivityStage = "brainstorming" | "strategizing" | "building" | "stalled" | "completed";
export interface RoomHandoff {
  from: string;
  to: string;
  at: string;
}

export type ActivityOutcome = "completed" | "failed" | "cancelled";

export interface ActivityRecord {
  taskId: string;
  title: string;
  /** Brain record this work belongs to. */
  cellId?: string;
  roomId?: string;
  stage?: ActivityStage;
  handoffs?: RoomHandoff[];
  startedAt: string;
  lastHeartbeat: string;
  state: "running" | ActivityOutcome;
  /** Plain-English result, written only after the work really finished. */
  detail?: string;
}

function read(): ActivityRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is ActivityRecord {
  const item = value as Partial<ActivityRecord> | null;
  return Boolean(
    item &&
    typeof item.taskId === "string" &&
    typeof item.title === "string" &&
    typeof item.startedAt === "string" &&
    typeof item.lastHeartbeat === "string" &&
    (item.state === "running" ||
      item.state === "completed" ||
      item.state === "failed" ||
      item.state === "cancelled"),
  );
}

function write(records: ActivityRecord[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    /* storage unavailable — this session only */
  }
}

export function listActivity(): ActivityRecord[] {
  if (typeof window === "undefined") return [];
  return read();
}

/** Called at the moment real work is actually submitted. */
export function startActivity(input: {
  taskId: string;
  title: string;
  cellId?: string;
  roomId?: string;
  stage?: ActivityStage;
}): ActivityRecord {
  const now = new Date().toISOString();
  const record: ActivityRecord = {
    taskId: input.taskId,
    title: input.title,
    ...(input.cellId ? { cellId: input.cellId } : {}),
    ...(input.roomId ? { roomId: input.roomId } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    startedAt: now,
    lastHeartbeat: now,
    state: "running",
  };
  if (typeof window !== "undefined") {
    write([record, ...read().filter((item) => item.taskId !== record.taskId)]);
    notify();
  }
  return record;
}

/** Called when that same work genuinely finished, one way or the other. */
export function finishActivity(taskId: string, outcome: ActivityOutcome, detail?: string): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  write(
    read().map((item) =>
      item.taskId === taskId
        ? { ...item, state: outcome, lastHeartbeat: now, ...(detail ? { detail } : {}) }
        : item,
    ),
  );
  notify();
}

export function toWorkEvents(records: ActivityRecord[]): WorkEvent[] {
  return records.map((record) => ({
    taskId: record.taskId,
    title: record.title,
    source: ACTIVITY_SOURCE,
    state: record.state,
    lastHeartbeat: record.lastHeartbeat,
    ...(record.cellId ? { cellId: record.cellId } : {}),
  }));
}

/* Simple change notification so the Brain can refresh without polling. */

const EVENT = "canx-office-activity-changed";

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeActivity(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** Explicit producer hook: call only after real work reports its room/stage.
 * Same-room calls are heartbeats; different-room calls preserve handoff evidence.
 */
export function updateActivityRoom(
  taskId: string,
  roomId: string,
  stage: Exclude<ActivityStage, "completed">,
): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  write(
    read().map((item) => {
      if (item.taskId !== taskId || item.state !== "running") return item;
      const handoffs =
        item.roomId && item.roomId !== roomId
          ? [...(item.handoffs ?? []), { from: item.roomId, to: roomId, at: now }].slice(-40)
          : item.handoffs;
      return { ...item, roomId, stage, lastHeartbeat: now, ...(handoffs ? { handoffs } : {}) };
    }),
  );
  notify();
}
