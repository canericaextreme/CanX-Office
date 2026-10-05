/** Existing-task execution through a fixed Office builder (Codex or Claude). No background loop. */
import type { CodexBuildResult } from './codex-builds.server';
import { firstRow, classifyManagerRisk, type ManagerTask, type WorkbenchDeps } from './manager-work.functions';
import { looksLikeOfficeCodeChange, shouldHandOffToCodex, officeBuildProtectedCategory } from './codex-task-handoff';
import { BUILDER_LABEL, type OfficeBuilder } from './builder-choice';

type BuildFn = (token: string, request?: string, prNumber?: number, runId?: number) => Promise<CodexBuildResult>;
interface Execution { kind: 'codex-task-v1' | 'office-task-v2'; builder: OfficeBuilder; attempt: string; runId?: number; state: string; prior: string; }
export interface TaskExecutionDeps {
  workbench: WorkbenchDeps;
  /** Codex builder (default). */
  build: BuildFn;
  /** Claude builder; only used when John explicitly chose Claude. */
  buildClaude?: BuildFn;
}
/** Legacy codex-task-v1 receipts are always Codex. */
export const readExecution = (text: string): Execution | null => {
  try {
    const x = JSON.parse(text);
    if (x?.kind === 'codex-task-v1') return { ...x, builder: 'codex' };
    if (x?.kind === 'office-task-v2' && (x.builder === 'codex' || x.builder === 'claude')) return x;
    return null;
  } catch { return null; }
};

export async function executeTaskWith(deps: TaskExecutionDeps, token: string, taskId: string, checkOnly = false, builder?: OfficeBuilder): Promise<CodexBuildResult> {
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { ok: false, detail: 'Choose a saved task identifier.' };
  const path = `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, 'GET', path);
  const task = firstRow<ManagerTask>(read.data);
  if (!read.ok || !task || task.owner_id !== owner.userId) return { ok: false, detail: 'The saved task could not be read for this owner.' };
  const execution = readExecution(task.evidence);
  const pick = (b: OfficeBuilder): BuildFn | undefined => b === 'claude' ? deps.buildClaude : deps.build;
  if (checkOnly) {
    if (!execution?.runId) return { ok: false, detail: 'This task has no verified build link. Assignment alone does not start work. If a previous submission was uncertain, inspect Build & Testing before retrying.' };
    if (builder && builder !== execution.builder) return { ok: false, detail: `This task was sent to ${BUILDER_LABEL[execution.builder]}, not ${BUILDER_LABEL[builder]}. Its status is checked only with the recorded builder.` };
    const run = pick(execution.builder);
    if (!run) return { ok: false, detail: `${BUILDER_LABEL[execution.builder]} status is not available on this server path.` };
    const live = await run(token, undefined, undefined, execution.runId);
    if (!live.ok) return live;
    const state = live.runs?.find(r => r.id === execution.runId)?.state;
    if (!state) return { ok: false, detail: 'No matching run evidence returned. Task status was left unchanged.' };
    const active = ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(state);
    // Successful candidates await review, not a claim that the Office changed.
    const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&evidence=eq.${encodeURIComponent(task.evidence)}&status=not.in.(done,cancelled)`, {
      status: active ? 'in_progress' : 'open', result: live.detail.slice(0, 2000),
      evidence: JSON.stringify({ ...execution, state }), updated_at: new Date().toISOString(),
    });
    return { ...live, detail: live.detail + (saved.ok && firstRow(saved.data) ? ' Task evidence updated; completion remains unverified.' : ' Task record was not updated; it may have changed during this check.') };
  }
  if (task.status === 'done' || task.status === 'cancelled') return { ok: false, detail: 'That task is already finished; nothing was started.' };
  if (execution && builder && execution.builder !== builder) return { ok: false, detail: `A build attempt was already recorded with ${BUILDER_LABEL[execution.builder]}. It was not sent to ${BUILDER_LABEL[builder]}; check the existing attempt instead.` };
  if (execution || /Codex handoff/i.test(task.evidence)) return { ok: false, detail: 'A build submission was already recorded for this task. Check its execution instead; it was not submitted again.' };
  const chosen: OfficeBuilder = builder ?? 'codex';
  const run = pick(chosen);
  if (!run) return { ok: false, detail: `${BUILDER_LABEL[chosen]} builds are not available on this server path; nothing was sent.` };
  const request = `${task.title}\n${task.detail}`.trim();
  if ((task.project && task.project.toLowerCase() !== 'canx office') || !shouldHandOffToCodex({
    codeChange: looksLikeOfficeCodeChange(request), taskRisk: task.risk,
    classifiedRisk: classifyManagerRisk(`start_${chosen}_build`, request),
    protectedCategory: officeBuildProtectedCategory(request), alreadySubmitted: false,
  })) return { ok: false, detail: 'This executor supports green CanX Office code changes only. This task needs its appropriate tool or approval; assigning a room does not execute it.' };
  const pending: Execution = { kind: 'office-task-v2', builder: chosen, attempt: crypto.randomUUID(), state: 'submission_unconfirmed', prior: task.evidence.slice(0, 700) };
  // Compare-and-set before dispatch prevents two conversations from executing
  // the same task. A lost response leaves the durable claim, never a retry.
  const claimText = JSON.stringify(pending);
  const claimed = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&updated_at=eq.${encodeURIComponent(task.updated_at)}&evidence=eq.${encodeURIComponent(task.evidence)}&status=not.in.(done,cancelled)`, {
    evidence: claimText, result: `Preparing one ${BUILDER_LABEL[chosen]} submission; execution not yet confirmed.`, updated_at: new Date().toISOString(),
  });
  if (!claimed.ok || !firstRow(claimed.data)) return { ok: false, detail: 'The execution claim could not be confirmed. Nothing was sent; reload the task before continuing.' };
  let live: CodexBuildResult;
  try { live = await run(token, request); }
  catch { live = { ok: false, detail: 'Submission could not be confirmed. Nothing was retried.' }; }
  const runId = live.runs?.[0]?.id;
  const linked = live.ok && Number.isSafeInteger(runId) && (runId ?? 0) > 0;
  const next: Execution = { ...pending, state: linked ? 'queued' : 'submission_unconfirmed', ...(linked && runId !== undefined ? { runId } : {}) };
  const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&evidence=eq.${encodeURIComponent(claimText)}&status=not.in.(done,cancelled)`, {
    status: linked ? 'in_progress' : 'open', evidence: JSON.stringify(next), result: live.detail.slice(0, 2000), updated_at: new Date().toISOString(),
  });
  await deps.workbench.rest(token, 'POST', 'rpc/log_manager_change', {
    _owner_id: owner.userId, _action: 'task.execute', _entity: 'manager_tasks', _entity_id: task.id,
    _before: { status: task.status }, _after: { attempt: pending.attempt, builder: chosen, state: next.state, run_id: runId ?? null },
  }).catch(() => undefined);
  return { ...live, detail: live.detail + (saved.ok && firstRow(saved.data) ? ' Execution evidence saved on the task.' : ' Execution evidence could not be saved; check Build & Testing before any further submission.') };
}
