import type { ManagerMemory, ManagerTask } from "@/lib/manager-work.functions";

export const SWEEP_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
type SweepMemory = Pick<ManagerMemory, "tasks" | "assignments" | "approvals" | "changes">;

/** Fail closed on missing/invalid activity dates and any recorded live blocker.
 * No writes: this draft only partitions the loaded board in the current session.
 */
export function sweepEligible(task: ManagerTask, memory: SweepMemory, now: number): boolean {
  if (task.status !== "done" && task.status !== "cancelled") return false;
  if (task.waiting_reason?.trim()) return false;
  const approvals = memory.approvals.filter((a) => a.task_id === task.id);
  const assignments = memory.assignments.filter((a) => a.task_id === task.id);
  if (approvals.some((a) => a.status === "pending") || assignments.some((a) => !a.completed_at)) return false;
  const dates = [
    task.created_at, task.updated_at,
    ...assignments.flatMap((a) => [a.assigned_at, a.completed_at!]),
    ...approvals.flatMap((a) => [a.created_at, ...(a.decided_at ? [a.decided_at] : [])]),
    ...memory.changes.filter((c) =>
      (c.entity === "manager_tasks" && c.entity_id === task.id) ||
      (c.entity === "manager_assignments" && assignments.some((a) => a.id === c.entity_id)) ||
      (c.entity === "manager_approvals" && approvals.some((a) => a.id === c.entity_id))
    ).map((c) => c.at),
  ].map((date) => Date.parse(date));
  return Number.isFinite(now) && dates.every((date) => Number.isFinite(date) && now - date >= SWEEP_IDLE_MS);
}

/** Each manual sweep adds eligible IDs; it never edits tasks or their history. */
export function runTrashSweep(memory: SweepMemory, archived: readonly string[], now: number): string[] {
  return [...new Set([...archived, ...memory.tasks.filter((task) => sweepEligible(task, memory, now)).map((task) => task.id)])];
}

/** New activity or a live blocker brings a previously swept task back to the board. */
export function isInTrash(task: ManagerTask, memory: SweepMemory, archived: readonly string[], now: number): boolean {
  return archived.includes(task.id) && sweepEligible(task, memory, now);
}
