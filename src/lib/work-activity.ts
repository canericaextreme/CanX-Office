/**
 * Live work activity for the CanX Brain.
 *
 * Rule, from John, 9 September 2026: movement in the Brain must reflect actual
 * work being done. Nothing here invents an event. There is no demonstration
 * mode, no decorative motion, and no way for the sample brain records to move.
 *
 * A record only moves when ALL of these are true:
 *   1. A real feed is connected and the owner is authenticated to read it.
 *   2. The event is not marked as sample data.
 *   3. Its state is "running".
 *   4. Its heartbeat is fresh (within FRESHNESS_MS).
 *   5. The reader has not asked for reduced motion.
 *
 * Queued, idle, completed, cancelled, failed and stale work is shown, and
 * stays still.
 */

/** How recent a heartbeat must be before the work counts as live. */
export const FRESHNESS_MS = 90_000;

export type WorkState = "running" | "queued" | "idle" | "completed" | "failed" | "cancelled";

export const WORK_STATE_LABELS: Record<WorkState, string> = {
  running: "Running now",
  queued: "Waiting to start",
  idle: "Idle",
  completed: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface WorkEvent {
  /** Authoritative task id from the system that actually runs the work. */
  taskId: string;
  /** Authoritative job/run id, when the source provides one. */
  jobId?: string;
  title: string;
  /** Which system reported this, e.g. the CanX-owned database. */
  source: string;
  state: WorkState;
  /** ISO time of the last heartbeat from the running work. */
  lastHeartbeat: string;
  /** Brain record this work belongs to (room, project, or worker role). */
  cellId?: string;
  workerId?: string;
  projectId?: string;
  /**
   * True for office demonstration records. Sample events are never animated,
   * under any setting.
   */
  sample?: boolean;
}

export interface WorkFeed {
  /** True only when a real, authenticated feed answered. */
  connected: boolean;
  /** Plain-English reason shown to John when nothing is connected. */
  status: string;
  source: string | null;
  checkedAt: string | null;
  events: WorkEvent[];
}

/** The honest default: nothing is connected, so nothing moves. */
export const DISCONNECTED_FEED: WorkFeed = {
  connected: false,
  status: "No live work connected",
  source: null,
  checkedAt: null,
  events: [],
};

export function isFresh(event: WorkEvent, now: number = Date.now()): boolean {
  const beat = Date.parse(event.lastHeartbeat);
  if (Number.isNaN(beat)) return false;
  const age = now - beat;
  return age >= -FRESHNESS_MS && age <= FRESHNESS_MS;
}

/** A running event whose heartbeat has gone quiet. Shown, but still. */
export function isStale(event: WorkEvent, now: number = Date.now()): boolean {
  return event.state === "running" && !isFresh(event, now);
}

export interface MotionOptions {
  reducedMotion: boolean;
  now?: number;
}

/** The single gate that decides whether anything on the map may move. */
export function canAnimate(feed: WorkFeed, event: WorkEvent, options: MotionOptions): boolean {
  if (options.reducedMotion) return false;
  if (!feed.connected) return false;
  if (event.sample) return false;
  if (event.state !== "running") return false;
  return isFresh(event, options.now ?? Date.now());
}

/** Events that are allowed to animate right now. Empty is the normal answer. */
export function animatingEvents(feed: WorkFeed, options: MotionOptions): WorkEvent[] {
  return feed.events.filter((event) => canAnimate(feed, event, options));
}

/** Brain record ids that are allowed to animate right now. */
export function animatingCellIds(feed: WorkFeed, options: MotionOptions): Set<string> {
  const ids = new Set<string>();
  for (const event of animatingEvents(feed, options)) {
    if (event.cellId) ids.add(event.cellId);
  }
  return ids;
}

/** What to show beside each event in the readable list. */
export function describeState(event: WorkEvent, now: number = Date.now()): string {
  if (isStale(event, now)) return "Running, but the heartbeat has gone quiet";
  return WORK_STATE_LABELS[event.state];
}

export function lastUpdatedLabel(event: WorkEvent, now: number = Date.now()): string {
  const beat = Date.parse(event.lastHeartbeat);
  if (Number.isNaN(beat)) return "Unknown";
  const seconds = Math.max(0, Math.round((now - beat) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(beat).toLocaleString();
}

/**
 * Reads the live work feed.
 *
 * There is no connected work feed yet: the CanX-owned database and owner
 * sign-in are still being set up. This deliberately returns the disconnected
 * feed rather than inventing anything. The builds running in ChatGPT or
 * Lovable are NOT office jobs and must never appear here.
 */
export function loadWorkFeed(): WorkFeed {
  return DISCONNECTED_FEED;
}
