import { describe, expect, it, vi } from 'vitest';
import { advanceElsieQueueWith, handoffMustQueue, queueTaskForBuilderWith, type TaskExecutionDeps } from './task-execution.server';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';

/** In-memory Work Board + builder that follow the same rules as production:
 * PostgREST filters, the scoped SQL claim, and GitHub's one-run-at-a-time guard.
 */
function office() {
  const tasks = new Map<string, ManagerTask>();
  let n = 0;
  const add = (t: Partial<ManagerTask>) => {
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    const row: ManagerTask = { id, owner_id: 'owner', title: `Task ${n}`, detail: 'Change the Finance room layout cards.', project: 'CanX Office', status: 'open', risk: 'green', worker: 'Claude', result: '', evidence: '', created_at: `2026-10-16T00:00:${String(n).padStart(2, '0')}Z`, updated_at: `2026-10-16T00:00:${String(n).padStart(2, '0')}Z`, ...t };
    tasks.set(id, row);
    return id;
  };
  const matches = (row: ManagerTask, query: string) => query.split('&').every(part => {
    const [key, raw = ''] = part.split(/=(.*)/s);
    if (!key || ['order', 'limit', 'select', 'offset'].includes(key)) return true;
    const value = String((row as unknown as Record<string, unknown>)[key] ?? '');
    const v = decodeURIComponent(raw);
    if (v.startsWith('eq.')) return value === v.slice(3);
    if (v.startsWith('ilike.')) return value.toLowerCase() === v.slice(6).toLowerCase();
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(value);
    if (v.startsWith('not.in.(')) return !v.slice(8, -1).split(',').includes(value);
    throw new Error('unsupported filter ' + v);
  });
  const claims: string[] = [];
  const rest = vi.fn(async (_token: string, method: string, path: string, body?: Record<string, unknown>) => {
    const [table, query = ''] = path.split(/\?(.*)/s);
    if (method === 'POST' && table === 'rpc/canx_mcp_claim_elsie_task') {
      // Mirrors supabase/migrations/20261016020000_elsie_scoped_task_claim.sql.
      const t = tasks.get(String(body?.['_task_id']));
      const b = String(body?.['_builder']);
      if (!t) return { ok: true, data: { ok: false, reason: 'not_found' } };
      if (t.status !== 'open' || t.risk !== 'green' || (t.project ?? '').toLowerCase() !== 'canx office') return { ok: true, data: { ok: false, reason: 'not_eligible' } };
      if (t.worker.toLowerCase() !== b) return { ok: true, data: { ok: false, reason: 'builder_mismatch' } };
      if (/office-task-v2|codex-task-v1|(?:Claude|Codex) handoff|elsie-claim/i.test(t.evidence)) return { ok: true, data: { ok: false, reason: 'already_attempted' } };
      if ([...tasks.values()].some(o => o.id !== t.id && o.worker.toLowerCase() === b && o.status === 'in_progress')) return { ok: true, data: { ok: false, reason: 'builder_busy' } };
      t.status = 'in_progress'; t.evidence = `${t.evidence}\n[elsie-claim ${b} ${t.id}]`; t.updated_at = new Date().toISOString();
      claims.push(t.id);
      return { ok: true, data: { ok: true } };
    }
    if (method === 'POST') return { ok: true, data: [] };
    if (table !== 'manager_tasks') throw new Error('unexpected ' + path);
    const rows = [...tasks.values()].filter(r => matches(r, query));
    if (method === 'GET') return { ok: true, data: rows.map(r => ({ ...r })) };
    if (method === 'PATCH') { rows.forEach(r => Object.assign(r, body)); return { ok: true, data: rows.map(r => ({ ...r })) }; }
    throw new Error('unexpected ' + method);
  });
  const runs: { id: number; state: string; title: string; url: string }[] = [];
  const buildClaude = vi.fn(async (_token: string, request?: string, _pr?: number, runId?: number) => {
    if (runId !== undefined) { const r = runs.find(x => x.id === runId); return r ? { ok: true, detail: `Task build ${runId}: ${r.state}.`, runs: [r] } : { ok: false, detail: 'missing' }; }
    if (request === undefined) return { ok: true, detail: 'status', runs: [...runs] };
    if (runs.some(r => ['queued', 'in_progress'].includes(r.state))) return { ok: false, detail: 'A Claude build is already queued or running.' };
    const run = { id: 100 + runs.length, state: 'queued', title: request.slice(0, 30), url: `https://github.com/canericaextreme/CanX-Office/actions/runs/${100 + runs.length}` };
    runs.push(run);
    return { ok: true, detail: 'GitHub accepted the Claude build request.', runs: [run] };
  });
  const workbench = { verifyOwner: vi.fn().mockResolvedValue({ ok: true, userId: 'owner' }), rest } as unknown as WorkbenchDeps;
  const deps: TaskExecutionDeps = { workbench, build: vi.fn().mockResolvedValue({ ok: true, detail: 'status', runs: [] }), buildClaude };
  const requests = () => buildClaude.mock.calls.filter(c => c[1] !== undefined);
  return { tasks, add, runs, deps, buildClaude, requests, claims };
}

describe('Elsie builder queue', () => {
  it('queues behind a running Claude build without touching it, then advances one task per finished build', async () => {
    const o = office();
    // An existing Claude assignment is already running (run 100).
    o.runs.push({ id: 100, state: 'in_progress', title: 'earlier', url: 'u' });
    const a = o.add({ title: 'Organize the Finance room cards' });
    const b = o.add({ title: 'Tidy the Finance room headings' });
    const c = o.add({ title: 'Recolour the Finance room banner' });
    for (const id of [a, b, c]) {
      const wait = await handoffMustQueue(o.deps, 't', 'claude', false);
      expect(wait.queue).toBe(true);
      expect((await queueTaskForBuilderWith(o.deps, 't', id, 'claude')).ok).toBe(true);
    }
    expect(o.requests()).toHaveLength(0);

    // Builder still busy: nothing released, the running build is not interrupted or duplicated.
    let step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toBeUndefined();
    expect(o.requests()).toHaveLength(0);
    expect(o.runs[0]!.state).toBe('in_progress');

    // Earlier build finishes -> first queued task starts, exactly once.
    o.runs[0]!.state = 'success';
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toMatchObject({ taskId: a, ok: true });
    expect(o.requests()).toHaveLength(1);
    expect(o.tasks.get(a)!.status).toBe('in_progress');
    expect(JSON.parse(o.tasks.get(a)!.evidence)).toMatchObject({ kind: 'office-task-v2', builder: 'claude', runId: 101 });
    expect(o.tasks.get(a)!.waiting_reason).toBe('');
    expect(o.tasks.get(b)!.waiting_reason).toMatch(/^Queued for Claude/);

    // A second turn while it runs releases nothing more.
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toBeUndefined();
    expect(o.requests()).toHaveLength(1);

    // Completion is read from the linked run; then B starts, then C, then the queue is empty.
    o.runs[1]!.state = 'success';
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.finished[0]).toContain('Organize the Finance room cards');
    expect(step.started?.taskId).toBe(b);
    expect(o.tasks.get(a)!.status).toBe('open');
    o.runs[2]!.state = 'failure';
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started?.taskId).toBe(c);
    o.runs[3]!.state = 'success';
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toBeUndefined();
    expect(o.requests()).toHaveLength(3);
    expect(o.claims).toEqual([a, b, c]);
  });

  it('two overlapping turns start only one build', async () => {
    const o = office();
    const a = o.add({}); const b = o.add({});
    await queueTaskForBuilderWith(o.deps, 't', a, 'claude');
    await queueTaskForBuilderWith(o.deps, 't', b, 'claude');
    const [x, y] = await Promise.all([advanceElsieQueueWith(o.deps, 't', 'claude'), advanceElsieQueueWith(o.deps, 't', 'claude')]);
    expect([x.started?.ok, y.started?.ok].filter(Boolean)).toHaveLength(1);
    expect(o.requests()).toHaveLength(1);
    expect(o.tasks.get(b)!.status).toBe('open');
  });

  it('never starts older Work Board tasks that only name Claude without a queue entry', async () => {
    const o = office();
    o.add({ title: 'Claude acknowledgement — old handoff' });
    const step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.checked).toBe(false);
    expect(o.buildClaude).not.toHaveBeenCalled();
  });

  it('keeps work queued when builder status cannot be read', async () => {
    const o = office();
    const a = o.add({});
    await queueTaskForBuilderWith(o.deps, 't', a, 'claude');
    o.buildClaude.mockResolvedValueOnce({ ok: false, detail: 'GitHub unavailable' });
    const step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toBeUndefined();
    expect(o.tasks.get(a)!.status).toBe('open');
    expect(o.requests()).toHaveLength(0);
  });

  it('parks a claimed task refused before sending, so the next queued task still runs', async () => {
    const o = office();
    const bad = o.add({ title: 'Increase the Finance spending limit', detail: 'Raise the spend cap.' });
    const good = o.add({});
    await queueTaskForBuilderWith(o.deps, 't', bad, 'claude');
    await queueTaskForBuilderWith(o.deps, 't', good, 'claude');
    let step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toMatchObject({ taskId: bad, ok: false });
    expect(o.tasks.get(bad)!.status).toBe('waiting');
    expect(o.requests()).toHaveLength(0);
    step = await advanceElsieQueueWith(o.deps, 't', 'claude');
    expect(step.started).toMatchObject({ taskId: good, ok: true });
  });

  it('limits each builder queue to three waiting tasks and refuses already-attempted tasks', async () => {
    const o = office();
    const ids = [o.add({}), o.add({}), o.add({}), o.add({})];
    for (const id of ids.slice(0, 3)) expect((await queueTaskForBuilderWith(o.deps, 't', id, 'claude')).ok).toBe(true);
    expect((await queueTaskForBuilderWith(o.deps, 't', ids[3]!, 'claude')).ok).toBe(false);
    const sent = o.add({ evidence: JSON.stringify({ kind: 'office-task-v2', builder: 'claude', attempt: 'x', state: 'queued', prior: '' }) });
    expect((await queueTaskForBuilderWith(o.deps, 't', sent, 'claude')).ok).toBe(false);
  });

  it('a new handoff dispatches straight away only when Claude is idle and nothing is queued', async () => {
    const o = office();
    expect((await handoffMustQueue(o.deps, 't', 'claude', false)).queue).toBe(false);
    expect((await handoffMustQueue(o.deps, 't', 'claude', true)).queue).toBe(true);
    const a = o.add({});
    await queueTaskForBuilderWith(o.deps, 't', a, 'claude');
    expect((await handoffMustQueue(o.deps, 't', 'claude', false)).queue).toBe(true);
  });
});
