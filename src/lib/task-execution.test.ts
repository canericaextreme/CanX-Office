import { describe, expect, it, vi } from 'vitest';
import { executeTaskWith, type TaskExecutionDeps } from './task-execution.server';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';

const id = '11111111-1111-4111-8111-111111111111';
function setup(overrides: Partial<ManagerTask> = {}) {
  let task: ManagerTask = { id, owner_id: 'owner', title: 'Change the room label', detail: 'Use a clearer label on the reception page.', project: 'CanX Office', status: 'open', risk: 'green', worker: 'Projects Lead', result: '', evidence: '', created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', ...overrides };
  const rest = vi.fn(async (_token: string, method: string, _path: string, body?: Record<string, unknown>) => {
    if (method === 'GET') return { ok: true, data: [{ ...task }] };
    if (method === 'PATCH') { task = { ...task, ...body } as ManagerTask; return { ok: true, data: [{ ...task }] }; }
    return { ok: true, data: [] };
  });
  const build = vi.fn().mockResolvedValue({ ok: true, detail: 'Accepted', runs: [{ id: 42, state: 'queued', title: 'Build', url: 'https://github.com/canericaextreme/CanX-Office/actions/runs/42' }] });
  const workbench = { verifyOwner: vi.fn().mockResolvedValue({ ok: true, userId: 'owner' }), rest } as unknown as WorkbenchDeps;
  const deps: TaskExecutionDeps = { workbench, build };
  return { deps, rest, build, task: () => task };
}
describe('saved task execution', () => {
  it('executes the actual help-text task with an internal builder instruction exactly once', async () => {
    const h = setup({
      title: 'Add Work Board help text explaining assigned-job execution',
      detail: 'Add the help text “Assigned jobs start when a worker begins execution” to the Work Board. Send to the builder once only. Keep the task open until build and test evidence verify the change. Report the build link and actual status; do not treat assignment as execution.',
    });
    expect((await executeTaskWith(h.deps, 'token', id)).ok).toBe(true);
    expect(h.build).toHaveBeenCalledWith('token', `${h.task().title}\n${h.task().detail}`);
    expect(JSON.parse(h.task().evidence).runId).toBe(42);
    await executeTaskWith(h.deps, 'token', id);
    expect(h.build).toHaveBeenCalledOnce();
  });
  it.each([
    'Send to the builder once only. Send an email to a customer.',
    'Send to the builder once only. Publish the change.',
    'Send to the builder once only. Delete customer records.',
    'Send to the builder once only. Buy a subscription.',
    'Send to the builder and email a customer.',
    'Send to the builder once only. Grant administrator permission.',
    'Send to the builder once only. Change the API_key.',
  ])('retains protected-action rejection after internal routing: %s', async detail => {
    const h = setup({ detail: `Add help text to the page. ${detail}` });
    expect((await executeTaskWith(h.deps, 'token', id)).ok).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
    expect(h.rest.mock.calls.every(call => call[1] === 'GET')).toBe(true);
  });
  it('claims before one submission, stores its exact run, and never resubmits the task', async () => {
    const h = setup();
    const result = await executeTaskWith(h.deps, 'token', id);
    expect(result.ok).toBe(true);
    expect(h.rest.mock.calls[1]?.[2]).toContain('updated_at=eq.');
    expect(h.rest.mock.invocationCallOrder[1]).toBeLessThan(h.build.mock.invocationCallOrder[0]!);
    expect(h.task().status).toBe('in_progress');
    expect(JSON.parse(h.task().evidence).runId).toBe(42);
    await executeTaskWith(h.deps, 'token', id);
    expect(h.build).toHaveBeenCalledOnce();
  });
  it('does not dispatch when a simultaneous claim loses or its response is unknown', async () => {
    const h = setup();
    h.rest.mockImplementationOnce(async () => ({ ok: true, data: [h.task()] }));
    h.rest.mockImplementationOnce(async () => ({ ok: true, data: [] }));
    expect((await executeTaskWith(h.deps, 'token', id)).ok).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
  });
  it('checks the linked run, preserves review requirement, and never marks success done', async () => {
    const h = setup();
    await executeTaskWith(h.deps, 'token', id);
    h.build.mockResolvedValueOnce({ ok: true, detail: 'Candidate tests passed; draft #51 requires review.', runs: [{ id: 42, state: 'success' }] });
    await executeTaskWith(h.deps, 'token', id, true);
    expect(h.build).toHaveBeenLastCalledWith('token', undefined, undefined, 42);
    expect(h.task().status).toBe('open');
    expect(h.task().result).toContain('requires review');
    expect(JSON.parse(h.task().evidence).state).toBe('success');
  });
  it.each([{ risk: 'yellow' as const }, { project: 'Safe Highways' }, { status: 'done' as const }, { owner_id: 'someone-else' }, { title: 'Read new mail', detail: 'Sort messages' }, { evidence: 'Codex handoff: not confirmed' }])('blocks unsupported or already attempted work: %j', async override => {
    const h = setup(override);
    expect((await executeTaskWith(h.deps, 'token', id)).ok).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
  });
  it('keeps a durable uncertainty record on timeout and blocks another submission', async () => {
    const h = setup(); h.build.mockRejectedValueOnce(new Error('timeout'));
    await executeTaskWith(h.deps, 'token', id);
    expect(h.task().status).toBe('open');
    expect(JSON.parse(h.task().evidence).state).toBe('submission_unconfirmed');
    await executeTaskWith(h.deps, 'token', id);
    expect(h.build).toHaveBeenCalledOnce();
  });
  it('does not invent a run link from an accepted response without a run ID', async () => {
    const h = setup(); h.build.mockResolvedValueOnce({ ok: true, detail: 'Accepted without run details' });
    await executeTaskWith(h.deps, 'token', id);
    expect(h.task().status).toBe('open');
    expect(JSON.parse(h.task().evidence).runId).toBeUndefined();
  });
});
