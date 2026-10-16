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

/** Fail closed when the builder has not been confirmed free. */
export function selectElsieQueueTask(
  tasks: readonly ElsieQueuedTask[],
  builder: "claude" | "codex",
  builderIdleVerified: boolean
): QueueSelection {
  if (!builderIdleVerified) return { state: "blocked", reason: "Builder availability not verified" };
  const assigned = tasks.filter(t => t.worker.trim().toLowerCase() === builder);
  if (assigned.some(t => t.status === "in_progress"))
    return { state: "blocked", reason: "Assigned builder has active work" };
  const queued = assigned
    .filter(t => t.status === "open" && t.risk === "green" && !/(?:\\"kind\\"\\s*:\\s*\\"office-task-v2\\"|\\"kind\\"\\s*:\\s*\\"codex-task-v1\\"|(?:Claude|Codex) handoff|\\[builder-execution)/i.test(t.evidence ?? ""))
    .sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return queued.length ? { state: "ready", task: queued[0] } : { state: "empty" };
}
