import { describe, it, expect, vi } from 'vitest';
import { runElsieTaskWith, elsieTaskRecordId, type ElsieTaskDeps, type LoopRecord } from './elsie-task-loop';
import { officeWorkBuildWith } from './office-work.server';
import { officeMcpWorkWith } from './office-mcp-work-service';
import { validWorkArguments } from './office-mcp-work';

const taskId = '10000000-0000-4000-8000-000000000001';
const ruleId = '10000000-0000-4000-8000-000000000002';
const input = { requestId: '10000000-0000-4000-8000-000000000003', taskId, ruleId, specNoteId: 'synthetic-request', colleague: 'claude' as const, instruction: 'Write two sentences describing the synthetic readiness check.' };
function fixture() {
  const rows = new Map<string, LoopRecord>();
  let v = 0;
  const put = (c: string, id: string, data: Record<string, unknown>) => rows.set(`${c}/${id}`, { data: { owner_id: 'owner', id, ...data }, version: String(++v) });
  put('manager_tasks', taskId, { risk: 'green', status: 'open', worker: 'Office Manager', result: 'Original result', evidence: 'Original evidence' });
  put('office_notes', input.specNoteId, { detail: 'Synthetic writing specification' });
  put('astra_memory', ruleId, { active: true, content: 'Synthetic standing rule: verify readback.' });
  const read = vi.fn(async (_t: string, c: string, id: string) => structuredClone(rows.get(`${c}/${id}`) ?? null));
  const write = vi.fn(async (_t: string, id: string, data: Record<string, unknown>, version?: string) => {
    const old = rows.get(`office_notes/${id}`);
    if (old ? old.version !== version : version !== undefined) return false;
    put('office_notes', id, data);
    return true;
  });
  const call = vi.fn(async (_t: string, actor: string) => ({ text: `${actor} complete response`, responseId: `response-${actor}-${v}`, model: 'configured-model' }));
  const deps: ElsieTaskDeps = { verify: vi.fn(async () => ({ ok: true as const, userId: 'owner', email: '', aal: 'aal1' })), read, write, call };
  return { deps, rows, put, read, write, call, id: elsieTaskRecordId('owner', input.requestId) };
}
describe('bounded Elsie text-task loop', () => {
  it('runs actual coordinator/worker/report callbacks in three phases, records sources and preserves originals', async () => {
    const f = fixture(); const original = structuredClone(f.rows.get(`manager_tasks/${taskId}`));
    expect(await runElsieTaskWith(f.deps, 'caller', input)).toMatchObject({ phase: 'planned', continue: true, ok: false });
    expect(await runElsieTaskWith(f.deps, 'caller', input)).toMatchObject({ phase: 'worked', continue: true, ok: false });
    expect(await runElsieTaskWith(f.deps, 'caller', input)).toMatchObject({ phase: 'complete', continue: false, ok: true, workerText: 'claude complete response' });
    expect(f.call.mock.calls.map(c => c[1])).toEqual(['elsie', 'claude', 'elsie']);
    expect(f.rows.get(`manager_tasks/${taskId}`)).toEqual(original);
    const independent = await f.read('caller', 'office_notes', f.id);
    const state = JSON.parse(String(independent!.data['detail']));
    expect(state.sources).toHaveLength(3); expect(state.worker.responseId).toContain('claude');
    expect(state.report.text).toBe('elsie complete response');
    expect(f.call.mock.calls[1]).toBeDefined();
    expect(await runElsieTaskWith(f.deps, 'caller', input)).toMatchObject({ ok: true, phase: 'complete' });
    expect(f.call).toHaveBeenCalledTimes(3);
  });
  it('rejects changed arguments under one request id', async () => {
    const f = fixture(); await runElsieTaskWith(f.deps, 't', input);
    expect(await runElsieTaskWith(f.deps, 't', { ...input, colleague: 'chatgpt' })).toMatchObject({ ok: false, detail: expect.stringContaining('different work') });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('claims the phase atomically: concurrent calls cannot invoke the provider twice', async () => {
    const f = fixture();
    // Hold the provider while the competing invocation reaches the claimed record.
    let finish!: () => void; const gate = new Promise<void>(r => { finish = r; });
    f.call.mockImplementation(async () => { await gate; return { text: 'Complete plan', responseId: 'response', model: 'model' }; });
    const first = runElsieTaskWith(f.deps, 't', input);
    await vi.waitFor(() => expect(f.call).toHaveBeenCalledTimes(1));
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false, phase: 'planning', continue: false });
    finish(); await first;
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it.each(['risk', 'status', 'worker', 'foreign', 'rule', 'missing'])('rejects unusable sources before model execution: %s', async kind => {
    const f = fixture();
    if (kind === 'missing') f.rows.delete(`office_notes/${input.specNoteId}`);
    else if (kind === 'rule') f.put('astra_memory', ruleId, { active: false });
    else f.put('manager_tasks', taskId, { risk: kind === 'risk' ? 'yellow' : 'green', status: kind === 'status' ? 'done' : 'open', worker: kind === 'worker' ? 'Someone else' : 'Office Manager', ...(kind === 'foreign' ? { owner_id: 'another-owner' } : {}) });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false });
    expect(f.call).not.toHaveBeenCalled();
  });
  it('refuses revoked access before reading or writing records', async () => {
    const f = fixture(); f.deps.verify = async () => ({ ok: false, reason: 'expired_session', message: 'Expired' });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false, detail: 'Expired' });
    expect(f.read).not.toHaveBeenCalled(); expect(f.call).not.toHaveBeenCalled();
  });
  it('does not continue against changed source versions', async () => {
    const f = fixture(); await runElsieTaskWith(f.deps, 't', input);
    f.put('office_notes', input.specNoteId, { detail: 'Changed request' });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false, detail: expect.stringContaining('changed') });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it.each(['timeout', 'budget', 'settlement'])('records failed/unknown provider outcome without replay: %s', async () => {
    const f = fixture(); f.call.mockRejectedValue(Error('failure'));
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ phase: 'failed', ok: false, continue: false });
    await runElsieTaskWith(f.deps, 't', input); expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized complete output instead of silently cutting it', async () => {
    const f = fixture(); f.call.mockResolvedValue({ text: 'x'.repeat(1801), responseId: 'response', model: 'model' });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ phase: 'failed', ok: false });
    expect(String(f.rows.get(`office_notes/${f.id}`)!.data['detail'])).not.toContain('x'.repeat(1800));
  });
  it('recovers a transient persistence failure by saving only; never invokes provider again', async () => {
    const f = fixture(); const orig = f.write.getMockImplementation()!; let failed = false;
    f.write.mockImplementation(async (...args) => {
      if (String(args[2]['detail']).includes('"phase":"planned"') && !failed) { failed = true; return false; }
      return orig(...args);
    });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ phase: 'planned', continue: true });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('returns recovery text and leaves the phase claimed when all result writes fail', async () => {
    const f = fixture(); const orig = f.write.getMockImplementation()!;
    f.write.mockImplementation(async (...args) => String(args[2]['detail']).includes('"phase":"planned"') ? false : orig(...args));
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false, recovery: { text: 'elsie complete response' } });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ phase: 'planning', continue: false });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('turns an expired claim into a verified unknown outcome without requeueing or charging again', async () => {
    const f = fixture(); let now = new Date('2026-10-24T12:00:00Z'); f.deps.now = () => now;
    const orig = f.write.getMockImplementation()!;
    f.write.mockImplementation(async (...args) => String(args[2]['detail']).includes('"phase":"planned"') ? false : orig(...args));
    await runElsieTaskWith(f.deps, 't', input);
    now = new Date('2026-10-24T12:03:00Z');
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ phase: 'unknown', continue: false, ok: false });
    await runElsieTaskWith(f.deps, 't', input); expect(f.call).toHaveBeenCalledTimes(1);
  });
  it('does not truncate source context to fit', async () => {
    const f = fixture(); f.put('office_notes', input.specNoteId, { detail: 'x'.repeat(24000) });
    expect(await runElsieTaskWith(f.deps, 't', input)).toMatchObject({ ok: false, detail: expect.stringContaining('capacity') });
    expect(f.call).not.toHaveBeenCalled();
  });
  it('exposes a validated connector action and distinct server callback, never a build', async () => {
    const f = fixture(); const build = vi.fn(); const elsieTask = vi.fn(async (t, v) => runElsieTaskWith(f.deps, t, v));
    expect(validWorkArguments('run_elsie_text_task', input)).toBe(true);
    expect(validWorkArguments('run_elsie_text_task', { ...input, tool: 'execute_build' })).toBe(false);
    const output = await officeWorkBuildWith({ verify: f.deps.verify, rpc: vi.fn(), build, elsieTask }, 'caller', { action: 'elsie_task', ...input });
    expect(output).toMatchObject({ phase: 'planned' }); expect(build).not.toHaveBeenCalled();
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/canx_mcp_work_active')) return Response.json(true);
      expect(String(url)).toBe('https://canx-office.lovable.app/api/office-work');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer caller' });
      expect(JSON.parse(String(init?.body))).toEqual({ action: 'elsie_task', ...input });
      return Response.json({ phase: 'planned', continue: true });
    });
    expect(await officeMcpWorkWith({ url: 'https://fixture.supabase.co', key: 'public', fetch: fetcher }, 'caller', 'run_elsie_text_task', input)).toMatchObject({ phase: 'planned' });
  });
});
