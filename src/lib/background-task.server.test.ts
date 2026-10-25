import { expect, it, vi } from 'vitest';
import { backgroundExecutionStep, backgroundNoteStore } from './background-task.server';
import { newBackgroundTask } from './background-task';
import type { WorkbenchDeps } from './manager-work.functions';
const taskId = '43da2350-e1aa-4d22-a1da-9885295888be';
it('persists exact-version checkpoints through the existing owner-scoped server storage path', async () => {
  const before = newBackgroundTask('checkpoint', 'owner', taskId, 0);
  let detail = JSON.stringify(before);
  const rest = vi.fn(async (_t: string, method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'PATCH') {
      expect(path).toContain(`detail=eq.${encodeURIComponent(detail)}`);
      detail = String(body?.['detail']);
    }
    return { ok: true, data: [{ owner_id: 'owner', source: 'CanX background checkpoint', detail }] };
  });
  const work = { verifyOwner: async () => ({ ok: true, userId: 'owner' }), rest } as unknown as WorkbenchDeps;
  const store = backgroundNoteStore(work, 'fixture', 'checkpoint');
  const after = { ...before, revision: 1, phase: 'paused' as const };
  expect(await store.compareSave(before, after)).toBe(true);
  expect(await store.read()).toEqual(after);
  expect(await store.compareSave(before, after)).toBe(false);
});
it('runs the actual server executor in harmless read-only mode with local transport fixtures', async () => {
  const task = newBackgroundTask('checkpoint', 'owner', taskId, 0);
  const build = vi.fn(async () => ({ ok: true, detail: 'Run still active', runs: [{ id: 7, title: 'Harmless fixture status', state: 'in_progress', url: 'https://example.invalid/7' }] }));
  const rest = vi.fn(async (_t: string, _method: string) => ({ ok: true, data: [{ id: taskId, owner_id: 'owner', status: 'in_progress', evidence: JSON.stringify({ kind: 'office-task-v2', builder: 'codex', runId: 7, state: 'in_progress', attempt: 'one', prior: '' }) }] }));
  const workbench = { verifyOwner: async () => ({ ok: true, userId: 'owner' }), rest } as unknown as WorkbenchDeps;
  expect(await backgroundExecutionStep({ workbench, build }, 'fixture', task, true)).toEqual({ kind: 'pending' });
  expect(build).toHaveBeenCalledWith('fixture', undefined, undefined, 7);
});
it('does not reach the builder after server authorization denial', async () => {
  const build = vi.fn();
  const workbench = { verifyOwner: async () => ({ ok: false, message: 'Denied' }) } as unknown as WorkbenchDeps;
  expect(await backgroundExecutionStep({ workbench, build }, 'fixture', newBackgroundTask('checkpoint', 'owner', taskId, 0), false)).toEqual({ kind: 'unknown' });
  expect(build).not.toHaveBeenCalled();
});
