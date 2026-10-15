/** Durable manager handoff using existing owner task storage and executor. */
import { firstRow, type ManagerTask } from './manager-work.functions';
import { executeTaskWith, readExecution, type TaskExecutionDeps } from './task-execution.server';
import { BUILDER_LABEL, type OfficeBuilder } from './builder-choice';

export async function managerBuilderHandoff(deps: TaskExecutionDeps, token: string, request: string, requestId: string, builder: OfficeBuilder) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
    return { ok: false, detail: 'A stable request identifier is required. Nothing was submitted.' };
  if (request.length > 2000) return { ok: false, detail: 'The handoff scope exceeds the saved task limit. Shorten the request; nothing was submitted.' };
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  const base = `manager_tasks?owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const exact = await deps.workbench.rest<ManagerTask[]>(token, 'GET', `${base}&id=eq.${requestId}`);
  if (!exact.ok) return { ok: false, detail: 'The request receipt could not be read. Nothing was submitted.' };
  let task = firstRow<ManagerTask>(exact.data);
  if (task && task.detail !== request) return { ok: false, detail: 'This request identifier belongs to a different scope. Nothing was submitted.' };
  if (!task) {
    // Exact scope only: never adopt a loosely related draft or change its scope.
    const drafts = await deps.workbench.rest<ManagerTask[]>(token, 'GET', `${base}&detail=eq.${encodeURIComponent(request)}&status=not.in.(done,cancelled)&order=created_at.asc&limit=2`);
    if (!drafts.ok) return { ok: false, detail: 'Existing drafts could not be checked. Nothing was submitted.' };
    task = drafts.data?.find(t => t.owner_id === owner.userId && t.detail === request && (!t.project || t.project.toLowerCase() === 'canx office')) ?? null;
    if (!task) {
      const saved = await deps.workbench.rest<ManagerTask[]>(token, 'POST', 'manager_tasks', {
        id: requestId, owner_id: owner.userId, title: request.slice(0, 300), detail: request, risk: 'green',
      });
      task = saved.ok ? firstRow<ManagerTask>(saved.data) : null;
      // A concurrent insert or lost insert response is read back, never retried.
      if (!task) {
        const back = await deps.workbench.rest<ManagerTask[]>(token, 'GET', `${base}&id=eq.${requestId}`);
        task = back.ok ? firstRow<ManagerTask>(back.data) : null;
      }
    }
  }
  if (!task || task.owner_id !== owner.userId || task.detail !== request)
    return { ok: false, detail: 'The saved handoff could not be confirmed. Nothing was submitted.' };
  const prior = readExecution(task.evidence);
  const result = await executeTaskWith(deps, token, task.id, !!prior?.runId, builder);
  return { ...result, ok: result.ok && !!result.runs?.some(run => Number.isSafeInteger(run.id) && run.id > 0), detail: `${BUILDER_LABEL[builder]} handoff — task ${task.id}. ${result.detail}${result.runs?.length ? ' ' + result.runs.map(r => `Run ${r.id}: ${r.state} — ${r.url}`).join('\n') : ' No confirmed run reference; do not resubmit an uncertain attempt.'}` };
}
