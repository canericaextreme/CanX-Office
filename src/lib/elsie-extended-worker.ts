import { decideExtendedWork, type ExtendedWorkSnapshot } from "./elsie-extended-work";
import { selectElsieQueueTask, type ElsieQueuedTask } from "./elsie-task-queue";

/** One deterministic, idempotency-aware server tick. No network, timer or secrets here.
 * Production adapter must verify the owner-scoped grant and use atomic DB leases,
 * fresh budget reservations, builder status and the existing guarded executor.
 */
export interface ElsieWorkTickDeps {
  readSnapshot: () => Promise<ExtendedWorkSnapshot & { eligibleTaskId: string }>;
  readTasks: () => Promise<readonly ElsieQueuedTask[]>;
  claimAndDispatch: (taskId: string) => Promise<{ submitted: boolean; detail: string }>;
  recordOutcome: (outcome: ElsieWorkTickResult) => Promise<void>;
}
export type ElsieWorkTickResult =
  | { state: "released"; taskId: string; detail: string }
  | { state: "waiting" | "stopped"; reason: string }
  | { state: "uncertain"; taskId?: string; reason: string };

export async function runElsieWorkTick(builder: "claude" | "codex", deps: ElsieWorkTickDeps): Promise<ElsieWorkTickResult> {
  let result: ElsieWorkTickResult;
  try {
    const snap = await deps.readSnapshot();
    const gate = decideExtendedWork(snap);
    if (gate.state !== "release") {
      result = { state: gate.state === "wait" ? "waiting" : "stopped", reason: gate.reason };
    } else {
      const selection = selectElsieQueueTask(await deps.readTasks(), builder, snap.builderIdleVerified);
      if (selection.state !== "ready") {
        result = { state: "waiting", reason: selection.state === "empty" ? "No queued work" : selection.reason };
      } else if (selection.task.id !== snap.eligibleTaskId) {
        result = { state: "uncertain", reason: "Queue choice differs from the task checked by the budget and authorization gate" };
      } else {
        // No automatic retry after a failed/uncertain dispatch; the existing
        // atomic task claim is the only supported path.
        const dispatched = await deps.claimAndDispatch(selection.task.id);
        result = dispatched.submitted
          ? { state: "released", taskId: selection.task.id, detail: dispatched.detail }
          : { state: "uncertain", taskId: selection.task.id, reason: dispatched.detail };
      }
    }
  } catch {
    result = { state: "uncertain", reason: "State read or execution failed; do not retry a potentially submitted task" };
  }
  try { await deps.recordOutcome(result); } catch {
    return { state: "uncertain", reason: "Outcome audit readback unavailable; inspect durable task and run before proceeding" };
  }
  return result;
}
