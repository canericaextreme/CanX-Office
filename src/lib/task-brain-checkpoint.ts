import { sha256Hex } from './sha256';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';

/** Persist evidence before completion. A retry only repeats this append/read, never the job. */
export async function taskBrainCheckpoint(
  deps: Pick<WorkbenchDeps, 'rest'>,
  token: string,
  task: ManagerTask,
  result: string,
  evidence: string,
): Promise<string | null> {
  const detail = JSON.stringify({
    schema: 'task-completion-checkpoint-v1', taskId: task.id,
    recordedBy: 'Office task verification', assignedWorker: task.worker || 'Unrecorded', project: task.project || 'Unrecorded',
    request: task.detail || task.title, result, tests: evidence || 'No test evidence supplied',
    status: 'completion_requested',
    nextStep: 'Read the linked task for current status; this checkpoint alone does not prove completion.',
  });
  const id = `task-handoff-${sha256Hex(JSON.stringify([task.owner_id, task.id, detail]))}`;
  const row = { id, owner_id: task.owner_id, kind: 'decision',
    title: `Task checkpoint: ${task.title}`.slice(0, 200), detail,
    source: 'CanX Brain: verified task completion checkpoint', provenance: 'ai-proposal', owner_name: '' };
  const path = `office_notes?owner_id=eq.${encodeURIComponent(task.owner_id)}&id=eq.${id}&select=id,title,detail,source&limit=1`;
  type Note = Pick<typeof row, 'id' | 'title' | 'detail' | 'source'>;
  const matches = (note: Note | undefined) => note?.id === id && note.title === row.title && note.detail === detail && note.source === row.source;
  try {
    const before = await deps.rest<Note[]>(token, 'GET', path);
    if (!before.ok || !Array.isArray(before.data)) return null;
    if (before.data.length && !matches(before.data[0])) return null;
    if (!before.data.length) {
      // A lost write response is resolved by readback, not by assuming failure or success.
      await deps.rest(token, 'POST', 'office_notes', row).catch(() => undefined);
    }
    const after = await deps.rest<Note[]>(token, 'GET', path);
    return after.ok && Array.isArray(after.data) && matches(after.data[0]) ? id : null;
  } catch { return null; }
}
