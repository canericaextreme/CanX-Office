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
    .filter(t => t.status === "open" && t.risk === "green" && !/office-task-v2|codex-task-v1|(?:Claude|Codex) handoff|builder-execution/i.test(t.evidence ?? ""))
    .sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return queued.length ? { state: "ready", task: queued[0] } : { state: "empty" };
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
