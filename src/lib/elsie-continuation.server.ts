/** Short owner approvals resolve through saved Work Board records, never chat history. */
import { requestIsDiscussionOnly } from "./builder-choice";
import type { ManagerTask } from "./manager-work.functions";
import { executeTaskWith, readExecution, type TaskExecutionDeps } from "./task-execution.server";

export const isElsieContinuation = (text: string): boolean =>
  /^(?:(?:ok(?:ay)?|yeah|yes|right|so|then|elsie)[,!.]?\s+)*(?:please\s+)?(?:just\s+)?(?:proceed|continue|resume|carry on|finish|complete)(?:\s+(?:with\s+)?(?:it|that|this|(?:the |this |that |my )?(?:current |active |saved )?(?:task|job|work)))?(?:\s+off)?[.!]?$/i.test(text.trim());

interface RecentTurn { role: string; content: string; created_at: string }
/** Text identifies a candidate only; the owned task is always re-read and all
 * execution gates still run. Never pick the newest task merely by its date. */
function referencedTask(tasks: ManagerTask[], turns: RecentTurn[]): ManagerTask | "ambiguous" | null {
  for (const turn of turns) {
    const text = turn.content.toLowerCase();
    const matches = tasks.filter(task => text.includes(task.id.toLowerCase())
      || (task.title.length >= 12 && text.includes(task.title.toLowerCase())));
    if (matches.length > 1) return "ambiguous";
    if (matches.length === 1) return matches[0]!;
  }
  return null;
}

/** A day-old saved instruction needs the owner to name it again. Updates from
 * status polling must not make an old task a fresh instruction. */
export const CONTINUATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function continueElsieTaskWith(
  deps: TaskExecutionDeps, token: string, request: string, now = Date.now(),
  references: readonly { role: string; content: string }[] = [],
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
      && (!task.project || task.project.toLowerCase() === "canx office");
  });
  // Persisted discussion survives reopening. Only bounded, recent exchanges
  // can identify the job; an old record is never fresh authority on its own.
  const recent = await deps.workbench.rest<RecentTurn[]>(token, "GET",
    `astra_recent_context?owner_id=eq.${encodeURIComponent(owner.userId)}&conversation_key=eq.office-manager&order=created_at.desc&limit=12`);
  if (!recent.ok || !Array.isArray(recent.data))
    return { ok: false, detail: "Recent task context could not be read. Which task should I continue? Nothing was sent." };
  const turns = [...references.slice(-12).reverse().map(turn => ({ ...turn, created_at: new Date(now).toISOString() })), ...recent.data].filter(turn => (turn.role === "user" || turn.role === "assistant")
    && typeof turn.content === "string" && Number.isFinite(Date.parse(turn.created_at))
    && now - Date.parse(turn.created_at) >= 0 && now - Date.parse(turn.created_at) <= CONTINUATION_MAX_AGE_MS)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const referenced = referencedTask(read.data.filter(task => task.owner_id === owner.userId), turns);
  const task = referenced && referenced !== "ambiguous"
    ? tasks.find(task => task.id === referenced.id)
    : tasks.length === 1 && referenced !== "ambiguous" ? tasks[0] : null;
  if (!task)
    return { ok: false, detail: tasks.length ? "More than one fresh Office task is saved. Which task do you mean? Nothing was sent."
      : "No unique fresh Office task was found. Please name the task and what to do; nothing was sent." };
  const execution = readExecution(task.evidence);
  // Existing attempts are checked, never replayed, including failed/uncertain runs.
  if (execution) {
    if (execution.builder !== "codex")
      return { ok: false, detail: "This task already has a Claude receipt. Please name the task and builder; nothing was sent." };
    return { ...await executeTaskWith(deps, token, task.id, true, "codex"), taskId: task.id };
  }
  if (task.status !== "open" || task.risk !== "green" || task.waiting_reason
    || /claude/i.test(task.worker) || /handoff|builder-execution|elsie-claim/i.test(task.evidence))
    return { ok: false, detail: "This saved task needs clarification or an existing execution check. Nothing was sent." };
  return { ...await executeTaskWith(deps, token, task.id, false, "codex"), taskId: task.id };
}
