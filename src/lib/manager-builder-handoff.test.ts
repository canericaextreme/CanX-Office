import { agreedBuilderRequest } from './manager.functions';
import { describe, expect, it, vi } from 'vitest';
import { managerBuilderHandoff } from './manager-builder-handoff';
import { directToolOutput } from './use-realtime-manager';
import type { TaskExecutionDeps } from './task-execution.server';

const id = '12345678-1234-1234-1234-123456789abc';
const request = 'Fix the CanX Office search button';
function fixture(failure = false, noRun = false) {
  let row: any = null;
  const build = vi.fn(async () => failure ? { ok: false, detail: 'Submission timed out; may be running.' } : { ok: true, detail: 'Accepted', ...(noRun ? {} : { runs: [{ id: 42, title: 'Build', state: 'queued', url: 'https://example.test/42' }] }) });
  const rest = vi.fn(async (_token: string, method: string, path: string, body?: any): Promise<any> => {
    if (path === 'rpc/log_manager_change') return { ok: true };
    if (method === 'GET') {
      const query = new URLSearchParams(path.split('?')[1]);
      const matchesId = !query.has('id') || query.get('id') === `eq.${row?.id}`;
      const matchesDetail = !query.has('detail') || query.get('detail') === `eq.${row?.detail}`;
      return { ok: true, data: row && matchesId && matchesDetail ? [row] : [] };
    }
    if (method === 'POST') row = { ...body, evidence: '', status: 'open', updated_at: 'initial' };
    if (method === 'PATCH') row = { ...row, ...body };
    return { ok: true, data: [row] };
  });
  const deps = { workbench: { verifyOwner: async () => ({ ok: true, userId: 'owner', aal: 'aal2' }), rest }, build } as unknown as TaskExecutionDeps;
  return { deps, build, rest, row: () => row };
}
describe('durable manager builder handoff', () => {
  it('text submits once, returns actual run, then checks the linked run on duplicate', async () => {
    const f = fixture();
    const first = await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    expect(first.detail).toContain('Run 42: queued');
    expect(first.detail).toContain('Codex handoff');
    await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    expect(f.build.mock.calls).toHaveLength(2);
    expect(f.build.mock.calls[0]).toEqual(['t', expect.stringContaining(request)]);
    expect(f.build.mock.calls[1]).toEqual(['t', undefined, undefined, 42]);
  });
  it('voice passes the stable ID through the same handoff', async () => {
    const f = fixture();
    const run = vi.fn(async (words: string, requestId?: string) => (await managerBuilderHandoff(f.deps, 't', words, requestId!, 'codex')).detail);
    const output = await directToolOutput(JSON.stringify({ request }), run, id);
    expect(output.result).toContain('Run 42');
    expect(run).toHaveBeenCalledWith(request, id);
  });
  for (const noRun of [false, true]) it(`does not retry an uncertain submission (missing run ${noRun})`, async () => {
    const f = fixture(!noRun, noRun);
    await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    const duplicate = await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    expect(f.build).toHaveBeenCalledTimes(1);
    expect(duplicate.ok).toBe(false);
    expect(f.row().status).toBe('open');
  });
  it('reuses an exact existing draft across a new request ID', async () => {
    const f = fixture();
    await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    await managerBuilderHandoff(f.deps, 't', request, 'aaaaaaaa-1234-1234-1234-123456789abc', 'codex');
    expect(f.rest.mock.calls.filter(c => c[1] === 'POST' && c[2] === 'manager_tasks')).toHaveLength(1);
    expect(f.build.mock.calls[1]).toEqual(['t', undefined, undefined, 42]);
  });
  it('voice failure never invents an accepted handoff', async () => {
    const output = await directToolOutput(JSON.stringify({ request }), async () => { throw new Error('lost response'); }, id);
    expect(output.ok).toBe(false);
    expect(output.result).toBe('');
  });
  it('rejects identifier scope reuse and unreadable receipts before dispatch', async () => {
    const f = fixture();
    await managerBuilderHandoff(f.deps, 't', request, id, 'codex');
    expect((await managerBuilderHandoff(f.deps, 't', 'Fix another button', id, 'codex')).ok).toBe(false);
    f.rest.mockResolvedValue({ ok: false });
    expect((await managerBuilderHandoff(f.deps, 't', request, id, 'codex')).ok).toBe(false);
    expect(f.build).toHaveBeenCalledTimes(1);
  });
});

it('continues an agreed owner code scope without taking scope from assistant prose', () => {
  expect(agreedBuilderRequest([{ role: 'user', content: request }, { role: 'assistant', content: 'Need a preview first' }, { role: 'user', content: 'Yes, go ahead' }])).toBe(request);
  expect(agreedBuilderRequest([{ role: 'user', content: 'How would you fix the button?' }, { role: 'user', content: 'Go ahead' }])).toBe('Go ahead');
});
