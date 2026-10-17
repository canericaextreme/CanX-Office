/** Read-only preparation for queue maintenance. Never infer completion or abandonment
 * from task text, builder success, or age; those are not owner decisions.
 */
export interface MaintenanceTask {
  id: string;
  status: string;
  project?: string | null;
  updated_at: string;
}

export const QUEUE_STALE_MS = 14 * 24 * 60 * 60 * 1000;
export const isFinishedTask = (task: MaintenanceTask) => task.status === "done" || task.status === "cancelled";

export function reviewTaskQueue(tasks: readonly MaintenanceTask[], now: number) {
  const finished = tasks.filter(isFinishedTask);
  const active = tasks.filter(t => !isFinishedTask(t));
  return {
    done: finished.filter(t => t.status === "done").length,
    cancelled: finished.filter(t => t.status === "cancelled").length,
    active: active.length,
    // Include finished records: every saved task should have a real project.
    missingProjectIds: tasks.filter(t => !t.project?.trim()).map(t => t.id),
    staleIds: active.filter(t => {
      const updated = Date.parse(t.updated_at);
      return Number.isFinite(updated) && updated <= now && now - updated > QUEUE_STALE_MS;
    }).map(t => t.id),
    unknownDateIds: active.filter(t => !Number.isFinite(Date.parse(t.updated_at))).map(t => t.id),
  };
}
