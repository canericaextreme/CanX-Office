import { describe, expect, it, vi } from 'vitest';
import { taskBrainCheckpoint } from './task-brain-checkpoint';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';

const task = { id: 't1', owner_id: 'owner', title: 'Task', worker: 'Claude', detail: 'Original request', project: 'p1' } as ManagerTask;
describe('task completion Brain checkpoint', () => {
  it('recovers a lost write acknowledgement and reuses the exact checkpoint on retry', async () => {
    let saved: unknown;
    const rest = vi.fn(async (_token, method, _path, body) => {
      if (method === 'POST') { saved = body; throw Error('lost acknowledgement'); }
      return { ok: true, data: saved ? [saved] : [] };
    }) as unknown as WorkbenchDeps['rest'];
    const id = await taskBrainCheckpoint({ rest }, 'token', task, 'Result', 'Tests passed');
    expect(id).toMatch(/^task-handoff-/);
    expect(await taskBrainCheckpoint({ rest }, 'token', task, 'Result', 'Tests passed')).toBe(id);
    expect(vi.mocked(rest).mock.calls.filter(c => c[1] === 'POST')).toHaveLength(1);
    expect(JSON.parse((saved as { detail: string }).detail)).toMatchObject({ taskId: 't1', assignedWorker: 'Claude', status: 'completion_requested' });
  });
  it('does not write when the initial record read fails', async () => {
    const rest = vi.fn().mockResolvedValue({ ok: false });
    expect(await taskBrainCheckpoint({ rest }, 'token', task, 'Result', '')).toBeNull();
    expect(rest.mock.calls.some(c => c[1] === 'POST')).toBe(false);
  });
  it('rejects a missing or mismatched readback even after an acknowledged write', async () => {
    for (const data of [[], [{ id: 'wrong', detail: 'wrong' }]]) {
      let reads = 0;
      const rest = vi.fn(async (_t, method) => method === 'POST' ? { ok: true } : { ok: true, data: ++reads === 1 ? [] : data }) as unknown as WorkbenchDeps['rest'];
      expect(await taskBrainCheckpoint({ rest }, 'token', task, 'Result', 'Tests')).toBeNull();
    }
  });
});
