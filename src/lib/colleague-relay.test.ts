import { describe, it, expect, vi } from 'vitest';
import { relayToColleagueWith, readColleagueRepliesWith, relayEntries, type RelayDeps } from './colleague-relay';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';
import { officeWorkBuildWith } from './office-work.server';
import { OFFICE_WORK_TOOLS, validWorkArguments } from './office-mcp-work';

const RID = '11111111-2222-4333-8444-555555555555';
const base: ManagerTask = { id: 'task-1', owner_id: 'owner', title: 'Welcome note', detail: 'Write it.', status: 'open', risk: 'green', worker: 'Office Manager', result: 'Earlier', evidence: 'Earlier evidence', created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z' } as ManagerTask;
const note = { id: 'canx-communication-20261008', title: 'Communication', detail: 'Explain once; no prompt carrying.', source: 'John', updated_at: '2026-10-08T01:00:00Z' };

function fixture(provider: 'claude' | 'chatgpt' = 'claude') {
  let row = { ...base }; let t = 0;
  const rest = vi.fn(async (_tk: string, method: string, path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data: unknown[] }> => {
    if (path.startsWith('office_notes')) return { ok: true, data: [note] };
    if (method === 'PATCH') {
      const m = /updated_at=eq\.([^&]+)/.exec(path); if (m && decodeURIComponent(m[1]!) !== row.updated_at) return { ok: true, data: [] };
      row = { ...row, ...body } as ManagerTask;
    }
    return { ok: true, data: [{ ...row }] };
  });
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(provider === 'claude'
    ? { id: 'msg_1', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Claude reply' }] }
    : { id: 'resp_1', status: 'completed', output_text: 'ChatGPT reply' }), { status: 200 }));
  const workbench = { verifyOwner: vi.fn(async () => ({ ok: true as const, userId: 'owner', email: '', aal: 'aal2' })), ensureBudget: vi.fn(async () => ({ ok: true })), rest: rest as WorkbenchDeps['rest'], reserve: vi.fn(async () => ({ allowed: true as const, reservationId: 'r1', remainingToday: 9 })), settle: vi.fn(async () => {}) };
  const deps: RelayDeps = { workbench, fetchImpl: fetchImpl as unknown as typeof fetch, openaiKey: 'k', openaiModel: 'gpt', anthropicKey: 'a', anthropicModel: 'claude-x', now: () => new Date(Date.UTC(2026, 9, 9, 1, 0, t++)) };
  return { deps, rest, fetchImpl, row: () => row };
}
const input = (c: 'claude' | 'chatgpt' = 'claude') => ({ accessToken: 'tok', taskId: 'task-1', requestId: RID, colleague: c, message: 'Please review the welcome note.' });

describe('colleague relay', () => {
  it('saves Claude reply with receipt, labelled direction source and readback; ChatGPT can read it back', async () => {
    const f = fixture();
    const r = await relayToColleagueWith(f.deps, input());
    expect(r.ok).toBe(true); expect(r.text).toBe('Claude reply');
    expect(r.directionSources?.[0]).toContain('office_notes/canx-communication-20261008');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((f.fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.tools).toBeUndefined(); expect(sent.messages[0].content).toContain('no prompt carrying');
    expect(f.row().status).toBe('open'); expect(f.row().result).toContain('Earlier');
    expect(f.row().evidence).toContain('msg_1');
    const read = await readColleagueRepliesWith(f.deps, 'tok', 'task-1');
    expect(read.entries).toEqual([expect.objectContaining({ requestId: RID, state: 'replied', reply: 'Claude reply', colleague: 'claude' })]);
  });
  it('repeating the request id returns the saved reply without a second provider call', async () => {
    const f = fixture('chatgpt');
    await relayToColleagueWith(f.deps, input('chatgpt'));
    const again = await relayToColleagueWith(f.deps, input('chatgpt'));
    expect(again.repeated).toBe(true); expect(again.text).toBe('ChatGPT reply'); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('uncertain provider outcome is not retried and the id stays claimed', async () => {
    const f = fixture(); f.fetchImpl.mockImplementation(async () => { throw new Error('net'); });
    const r = await relayToColleagueWith(f.deps, input());
    expect(r.ok).toBe(false); expect(r.uncertain).toBe(true);
    const again = await relayToColleagueWith(f.deps, input());
    expect(again.uncertain).toBe(true); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(relayEntries(f.row())[0]?.state).toBe('claimed');
  });
  it('refuses unverified owner, missing key, non-green or finished tasks before any provider call', async () => {
    const a = fixture(); a.deps.workbench.verifyOwner = async () => ({ ok: false, reason: 'mfa_required', message: 'MFA' } as never);
    expect((await relayToColleagueWith(a.deps, input())).ok).toBe(false); expect(a.rest).not.toHaveBeenCalled();
    const b = fixture(); b.deps.anthropicKey = undefined; expect((await relayToColleagueWith(b.deps, input())).ok).toBe(false);
    for (const patch of [{ risk: 'yellow' }, { status: 'done' }]) {
      const c = fixture(); c.rest.mockImplementation(async () => ({ ok: true, data: [{ ...base, ...patch }] }));
      expect((await relayToColleagueWith(c.deps, input())).ok).toBe(false); expect(c.fetchImpl).not.toHaveBeenCalled();
    }
    expect(b.fetchImpl).not.toHaveBeenCalled();
  });
  it('budget denial sends nothing; claim conflict sends nothing', async () => {
    const f = fixture(); f.deps.workbench.reserve = async () => ({ allowed: false, reason: 'budget_limit', message: 'Budget blocked.' } as never);
    expect((await relayToColleagueWith(f.deps, input())).ok).toBe(false); expect(f.fetchImpl).not.toHaveBeenCalled();
    const g = fixture(); g.rest.mockImplementation(async (_t, m, p) => p.startsWith('office_notes') ? { ok: true, data: [note] } : m === 'PATCH' ? { ok: true, data: [] } : { ok: true, data: [{ ...base }] });
    expect((await relayToColleagueWith(g.deps, input())).ok).toBe(false); expect(g.fetchImpl).not.toHaveBeenCalled();
  });
  it('labels a missing direction note instead of inventing one', async () => {
    const f = fixture(); const orig = f.rest.getMockImplementation()!;
    f.rest.mockImplementation(async (...a: Parameters<typeof orig>) => a[2].startsWith('office_notes') ? { ok: true, data: [] } : orig(...a));
    const r = await relayToColleagueWith(f.deps, input()); expect(r.directionSources?.[0]).toContain('not found');
  });
  it('bridge and MCP expose relay as separate validated actions, never as a build', async () => {
    const relay = vi.fn(async () => ({ ok: true })); const build = vi.fn();
    await officeWorkBuildWith({ verify: async () => ({ ok: true, userId: 'o', email: '', aal: 'aal2' }), rpc: vi.fn(), build, relay }, 't', { action: 'relay', requestId: RID, taskId: 'task-1', colleague: 'claude', message: 'hi' });
    expect(relay).toHaveBeenCalledOnce(); expect(build).not.toHaveBeenCalled();
    expect(OFFICE_WORK_TOOLS.map(t => t.name)).toEqual(expect.arrayContaining(['relay_to_colleague', 'read_colleague_replies']));
    expect(validWorkArguments('relay_to_colleague', { requestId: 'bad', taskId: 'x', colleague: 'claude', message: 'm' })).toBe(false);
    expect(validWorkArguments('relay_to_colleague', { requestId: RID, taskId: 'x', colleague: 'claude', message: 'm' })).toBe(true);
  });
});
