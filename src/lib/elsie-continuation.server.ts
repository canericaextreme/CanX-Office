/** Short owner approvals resolve through saved Work Board records, never chat history. */
import { requestIsDiscussionOnly } from "./builder-choice";
import type { ManagerTask } from "./manager-work.functions";
import { executeTaskWith, readExecution, type TaskExecutionDeps } from "./task-execution.server";

export const isElsieContinuation = (text: string): boolean =>
  /^(?:please\s+)?(?:proceed(?: with that)?|continue|carry on|finish that)[.!]?$/i.test(text.trim());

/** A day-old saved instruction needs the owner to name it again. Updates from
 * status polling must not make an old task a fresh instruction. */
export const CONTINUATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function continueElsieTaskWith(
  deps: TaskExecutionDeps, token: string, request: string, now = Date.now(),
) {
  if (!isElsieContinuation(request) || requestIsDiscussionOnly(request))
    return { ok: false, detail: "No continuation was sent. Please name the task you want to continue." };
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  const read = await deps.workbench.rest<ManagerTask[]>(token, "GET",
    `manager_tasks?owner_id=eq.${encodeURIComponent(owner.userId)}&status=in.(open,in_progress,waiting)&order=created_at.desc&limit=101`);
  if (!read.ok || !Array.isArray(read.data) || read.data.length > 100)
    return { ok: false, detail: "Saved tasks could not be resolved completely. Please name the task; nothing was sent." };
  const tasks = read.data.filter(task => {
    const age = now - Date.parse(task.created_at);
    return task.owner_id === owner.userId && ["open", "in_progress", "waiting"].includes(task.status)
      && age >= 0 && age <= CONTINUATION_MAX_AGE_MS
      && task.project?.toLowerCase() === "canx office";
  });
  if (tasks.length !== 1)
    return { ok: false, detail: tasks.length ? "More than one fresh Office task is saved. Which task do you mean? Nothing was sent."
      : "No unique fresh Office task was found. Please name the task and what to do; nothing was sent." };
  const task = tasks[0]!;
  const execution = readExecution(task.evidence);
  // Existing attempts are checked, never replayed, including failed/uncertain runs.
  if (execution) {
    if (execution.builder !== "codex")
      return { ok: false, detail: "This task already has a Claude receipt. Please name the task and builder; nothing was sent." };
    return executeTaskWith(deps, token, task.id, true, "codex");
  }
  if (task.status !== "open" || task.risk !== "green" || task.waiting_reason
    || /claude/i.test(task.worker) || /handoff|builder-execution|elsie-claim/i.test(task.evidence))
    return { ok: false, detail: "This saved task needs clarification or an existing execution check. Nothing was sent." };
  return executeTaskWith(deps, token, task.id, false, "codex");
}
