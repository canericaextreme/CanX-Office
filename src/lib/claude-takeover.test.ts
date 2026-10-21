import { describe, expect, it, vi } from 'vitest';
import { claudeTakeoverRefusal, hasTakeover, needsFullClaude, newTakeoverNoteDetail, parseTakeoverNote, takeoverMarker, takeoverStatusText } from './claude-takeover';
import { executeTaskWith, handTaskToClaudeWith, type TaskExecutionDeps } from './task-execution.server';
import { managerBuilderHandoff } from './manager-builder-handoff';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';

describe('which Claude jobs skip the small builder', () => {
  it.each([
    'Delete the Claude button at the top of the screen. Add a tab with Claude at the bottom, and put the build-with-Claude link in there.',
    'Claude, build a ChatGPT-style chat panel for the Office.',
    'Have a full Claude worker redo the Reception layout.',
    'Claude: redesign the Finance overview.',
  ])('big: %s', text => expect(needsFullClaude(text)).toBe(true));
  it.each([
    'Claude, rename the Work Board heading to Jobs.',
    'Claude has to fix the typo on the Legal room title.',
  ])('small: %s', text => expect(needsFullClaude(text)).toBe(false));
});

describe('takeover notes', () => {
  it('round-trips the first line Claude updates', () => {
    const first = newTakeoverNoteDetail({ taskId: 't1', reason: 'after-failure', at: '2026-10-21T02:30:00.000Z', title: 'Chat tab', detail: 'Add the tab.', failedRun: 'run 7: failure' });
    expect(parseTakeoverNote(first)).toMatchObject({ state: 'waiting' });
    expect(first).toContain('JOB: Chat tab');
    expect(parseTakeoverNote('STATE: pr-open | LINK: https://claude.ai/code/session_1 | PR: #204 | NOTE: tests green')).toEqual({ state: 'pr-open', link: 'https://claude.ai/code/session_1', pr: 204, note: 'tests green' });
    expect(parseTakeoverNote('STATE: done-ish')).toBeNull();
    expect(parseTakeoverNote('STATE: working | LINK: https://evil.example/x')?.link).toBeUndefined();
  });
  it('tells John the real state, and a merged PR wins over a stale note', () => {
    expect(takeoverStatusText({ state: 'waiting' })).toContain('not been picked up yet');
    expect(takeoverStatusText({ state: 'working', link: 'https://claude.ai/code/session_1' })).toContain('building it now');
    expect(takeoverStatusText({ state: 'pr-open', pr: 204 }, { state: 'merged', url: 'https://github.com/x/pull/204' })).toContain('press Publish');
    expect(takeoverStatusText({ state: 'blocked', note: 'needs a budget' })).toContain('needs your decision: needs a budget');
    for (const s of ['waiting', 'working', 'pr-open', 'merged', 'live'] as const) expect(takeoverStatusText({ state: s })).not.toMatch(/fail/i);
  });
  it('hands over only when John asks Claude', () => {
    expect(claudeTakeoverRefusal('Give that job to Claude')).toBeNull();
    expect(claudeTakeoverRefusal('Let Claude take over the chat tab task')).toBeNull();
    expect(claudeTakeoverRefusal('Give it to Codex')).not.toBeNull();
    expect(claudeTakeoverRefusal('Claude or Codex, which is better?')).not.toBeNull();
  });
});

const id = '11111111-1111-4111-8111-111111111111';
function setup(overrides: Partial<ManagerTask> = {}) {
  let task: ManagerTask = { id, owner_id: 'owner', title: 'Claude chat tab', detail: 'Add a Claude tab beside the ChatGPT tab.', project: 'CanX Office', status: 'open', risk: 'green', worker: 'Claude', result: '', evidence: '', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z', ...overrides };
  const notes = new Map<string, { id: string; detail: string }>();
  const rest = vi.fn(async (_token: string, method: string, path: string, body?: Record<string, unknown>): Promise<any> => {
    if (path === 'rpc/log_manager_change') return { ok: true };
    if (path.startsWith('office_notes')) {
      if (method === 'POST') { notes.set(String(body?.['id']), body as any); return { ok: true, data: [body] }; }
      const noteId = decodeURIComponent(/id=eq\.([^&]+)/.exec(path)?.[1] ?? '');
      return { ok: true, data: notes.has(noteId) ? [notes.get(noteId)] : [] };
    }
    if (method === 'GET') return { ok: true, data: [{ ...task }] };
    if (method === 'PATCH') { task = { ...task, ...body } as ManagerTask; return { ok: true, data: [{ ...task }] }; }
    return { ok: true, data: [] };
  });
  const buildClaude = vi.fn().mockResolvedValue({ ok: true, detail: 'Accepted', runs: [{ id: 42, state: 'queued', title: 'Build', url: 'https://github.com/canericaextreme/CanX-Office/actions/runs/42' }] });
  const readChange = vi.fn().mockResolvedValue(null);
  const workbench = { verifyOwner: vi.fn().mockResolvedValue({ ok: true, userId: 'owner' }), rest } as unknown as WorkbenchDeps;
  const deps: TaskExecutionDeps = { workbench, build: vi.fn(), buildClaude, readChange };
  return { deps, rest, buildClaude, readChange, notes, task: () => task };
}

describe('handing a task to a full Claude worker', () => {
  it('saves the Brain note before marking the task, and never starts a paid run', async () => {
    const h = setup();
    const result = await handTaskToClaudeWith(h.deps, 'token', id, 'asked');
    expect(result.ok).toBe(true);
    expect(h.buildClaude).not.toHaveBeenCalled();
    expect(h.notes.get(`claude-takeover-${id}`)?.detail).toMatch(/^STATE: waiting/);
    expect(hasTakeover(h.task().evidence)).toBe(true);
    expect(h.task().status).toBe('waiting');
    const order = h.rest.mock.calls.map(c => `${c[1]} ${String(c[2]).split('?')[0]}`);
    expect(order.indexOf('POST office_notes')).toBeLessThan(order.indexOf('PATCH manager_tasks'));
  });
  it('a failed small Claude build is handed over automatically, once', async () => {
    const h = setup({ status: 'in_progress', evidence: JSON.stringify({ kind: 'office-task-v2', builder: 'claude', attempt: 'a', runId: 42, state: 'queued', prior: '' }) });
    h.buildClaude.mockResolvedValue({ ok: true, detail: 'Task build 42: failure.', runs: [{ id: 42, state: 'failure', title: 'Build', url: 'u' }] });
    const first = await executeTaskWith(h.deps, 'token', id, true);
    expect(first.detail).toContain('could not finish this');
    expect(first.detail).toContain('Handed to a full Claude worker');
    expect(hasTakeover(h.task().evidence)).toBe(true);
    const again = await executeTaskWith(h.deps, 'token', id, true);
    expect(again.detail).toContain('not been picked up yet');
    expect(h.buildClaude).toHaveBeenCalledTimes(1);
  });
  it("status reads Claude's note and the live PR", async () => {
    const h = setup({ evidence: takeoverMarker('2026-10-21T02:30:00.000Z', 'asked') });
    h.notes.set(`claude-takeover-${id}`, { id: `claude-takeover-${id}`, detail: 'STATE: pr-open | LINK: https://claude.ai/code/session_1 | PR: 204' });
    h.readChange.mockResolvedValue({ state: 'merged', url: 'https://github.com/canericaextreme/CanX-Office/pull/204' });
    const status = await executeTaskWith(h.deps, 'token', id, true);
    expect(h.readChange).toHaveBeenCalledWith(204);
    expect(status.detail).toContain('Change #204 is merged');
  });
  it('refuses protected or non-green tasks', async () => {
    const h = setup({ risk: 'yellow' });
    expect((await handTaskToClaudeWith(h.deps, 'token', id, 'asked')).ok).toBe(false);
    expect(h.notes.size).toBe(0);
  });
  it('a big Claude request skips the small builder up front', async () => {
    let row: any = null;
    const rest = vi.fn(async (_t: string, method: string, path: string, body?: any): Promise<any> => {
      if (path === 'rpc/log_manager_change' || path.startsWith('office_notes')) return { ok: true, data: [] };
      if (method === 'POST') row = { ...body, evidence: '', status: 'open', updated_at: 'initial', project: '' };
      if (method === 'PATCH') row = { ...row, ...body };
      return { ok: true, data: row ? [row] : [] };
    });
    const buildClaude = vi.fn();
    const deps = { workbench: { verifyOwner: async () => ({ ok: true, userId: 'owner' }), rest }, build: vi.fn(), buildClaude } as unknown as TaskExecutionDeps;
    const result = await managerBuilderHandoff(deps, 't', 'Claude, build a ChatGPT-style chat panel for the Office.', '12345678-1234-1234-1234-123456789abc', 'claude');
    expect(buildClaude).not.toHaveBeenCalled();
    expect(result.detail).toContain('Handed to a full Claude worker');
  });
});
