import { useMemo } from "react";
import { reviewTaskQueue, type MaintenanceTask } from "@/lib/task-queue-maintenance";

/** A report over the loaded records, not a background job or a write receipt. */
export function TaskQueueReview({ tasks }: { tasks: readonly MaintenanceTask[] }) {
  const report = useMemo(() => ({ at: new Date(), ...reviewTaskQueue(tasks, Date.now()) }), [tasks]);
  return (
    <section aria-label="Office Health task queue review" className="space-y-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">Office Health — task queue review</p>
      <p role="status">Reviewed loaded tasks {report.at.toLocaleString()}: {report.active} unfinished; {report.done} completed; {report.cancelled} cancelled. Finished records are separated from active work below.</p>
      <p>{report.staleIds.length} unfinished tasks have no update in over 14 days; {report.missingProjectIds.length} saved tasks have no project; {report.unknownDateIds.length} unfinished tasks have an unreadable update date.</p>
      <p className="text-muted-foreground">No saved records changed. Review old tasks before cancelling them; age does not prove abandonment. Verify completion before marking done. Use Edit to attach the real project ID from Projects; do not guess a project from the task wording.</p>
      <p className="text-muted-foreground">Recurring cleanup is blocked: no daily or weekly background job is configured. This review runs when task data loads or refreshes while this page is open. It is not a complete queue audit if the server returned only part of the list.</p>
    </section>
  );
}
