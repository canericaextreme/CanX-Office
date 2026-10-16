/** Deterministic queue selection over already-saved owner Work Board tasks.
 * Never dispatches by itself. Actual builder execution uses the existing owner,
 * risk, budget, idempotency and approval gates.
 */
export interface ElsieQueuedTask {
  id: string;
  detail: string;
  status: string;
  risk: string;
  worker: string;
  created_at: string;
  evidence?: string | null;
}

export type QueueSelection =
  | { state: "blocked"; reason: string }
  | { state: "empty" }
  | { state: "ready"; task: ElsieQueuedTask };

/** At most this many tasks wait per builder, so unattended spend stays bounded. */
export const MAX_QUEUED_PER_BUILDER = 3;

/** States in which a builder run is still using the builder. */
export const ACTIVE_RUN_STATES: ReadonlySet<string> = new Set(["queued", "in_progress", "waiting", "pending", "requested", "running"]);

/** Durable owner authorization written on a task when John queues it for a builder.
 * Only tasks carrying this marker are ever released without a fresh instruction.
 */
export const queueMarker = (builder: "claude" | "codex", at: string): string => `[elsie-queue ${builder} ${at}]`;
export const hasQueueMarker = (evidence: string | null | undefined, builder: "claude" | "codex"): boolean =>
  new RegExp(`\\[elsie-queue ${builder} [0-9T:.\\-]+Z\\]`).test(evidence ?? "");

const ATTEMPTED = /office-task-v2|codex-task-v1|(?:Claude|Codex) handoff|builder-execution|elsie-claim/i;
const assignedTo = (t: ElsieQueuedTask, builder: "claude" | "codex") => t.worker.trim().toLowerCase() === builder;

/** Tasks John queued for this builder that have not been attempted, oldest first. */
export function queuedTasksFor(tasks: readonly ElsieQueuedTask[], builder: "claude" | "codex"): ElsieQueuedTask[] {
  return tasks
    .filter(t => assignedTo(t, builder) && t.status === "open" && t.risk === "green"
      && hasQueueMarker(t.evidence, builder) && !ATTEMPTED.test(t.evidence ?? ""))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Fail closed when the builder has not been confirmed free. Only queued
 * (owner-authorized) tasks are eligible, so older Work Board tasks that merely
 * name a builder are never started by the queue.
 */
export function selectElsieQueueTask(
  tasks: readonly ElsieQueuedTask[],
  builder: "claude" | "codex",
  builderIdleVerified: boolean
): QueueSelection {
  if (!builderIdleVerified) return { state: "blocked", reason: "Builder availability not verified" };
  if (tasks.some(t => assignedTo(t, builder) && t.status === "in_progress"))
    return { state: "blocked", reason: "Assigned builder has active work" };
  const next = queuedTasksFor(tasks, builder)[0];
  return next ? { state: "ready", task: next } : { state: "empty" };
}

/** Queue dispatch adapter: an atomic server claim must precede the existing
 * builder executor. A failed, uncertain or duplicate claim never starts work.
 * This function must only be invoked by a user-authorized, authenticated
 * server action with a fresh builder-availability receipt.
 */
export async function dispatchSelectedElsieTask(
  selection: QueueSelection,
  deps: {
    claim: (id: string) => Promise<{ ok: boolean; reason?: string }>;
    execute: (id: string) => Promise<{ ok: boolean; detail: string }>;
  }
): Promise<{ submitted: boolean; detail: string }> {
  if (selection.state !== "ready") return { submitted: false, detail: selection.state === "blocked" ? selection.reason : "No eligible tasks" };
  let claimed: { ok: boolean; reason?: string };
  try { claimed = await deps.claim(selection.task.id); }
  catch { return { submitted: false, detail: "Claim outcome uncertain. No build submitted; inspect saved task." }; }
  if (!claimed.ok) return { submitted: false, detail: claimed.reason ?? "Task claim rejected" };
  try {
    const result = await deps.execute(selection.task.id);
    return { submitted: result.ok, detail: result.detail };
  } catch {
    return { submitted: false, detail: "Builder result uncertain; do not retry this claimed task automatically." };
  }
}
