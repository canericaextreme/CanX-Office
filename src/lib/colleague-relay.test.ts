import { describe, it, expect, vi } from 'vitest';
import { callRelayProvider, relayToColleagueWith, readColleagueRepliesWith, relayEntries, type RelayDeps } from './colleague-relay';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';
import { officeWorkBuildWith } from './office-work.server';
import { OFFICE_WORK_TOOLS, validWorkArguments } from './office-mcp-work';
import { OFFICE_GOALS_ID } from './office-goals';

const RID = '11111111-2222-4333-8444-555555555555';
const base: ManagerTask = { id: 'task-1', owner_id: 'owner', title: 'Welcome note', detail: 'Write it.', status: 'open', risk: 'green', worker: 'Office Manager', result: 'Earlier', evidence: 'Earlier evidence', created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z' } as ManagerTask;
const note = { id: 'canx-communication-20261008', title: 'Communication', detail: 'Explain once; no prompt carrying.', source: 'John', updated_at: '2026-10-08T01:00:00Z' };

function fixture(provider: 'claude' | 'chatgpt' = 'claude', start: Partial<ManagerTask> = {}) {
  let row = { ...base, ...start } as ManagerTask; let t = 0;
  const rest = vi.fn(async (_tk: string, method: string, path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data: unknown[] }> => {
    if (path.includes(`id=eq.${OFFICE_GOALS_ID}`)) return { ok: true, data: [{ id: OFFICE_GOALS_ID, title: 'Example goals', detail: 'GOAL_FIXTURE: prioritize checked prototypes', provenance: 'john' }] };
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
  it.each(['rate_limit_exceeded', 'slow_down', 'credit_balance_exhausted', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded'])('retains a documented quota/rate code without retrying: %s', async code => {
    const f = fixture('chatgpt'); f.fetchImpl.mockImplementation(async () => Response.json({ error: { code, type: code === 'rate_limit_exceeded' ? 'tokens' : 'insufficient_quota', message: 'PRIVATE_MESSAGE' } }, { status: 429, headers: { 'retry-after': '12.5' } }));
    const r = await callRelayProvider(f.deps, 'chatgpt', 'system', 'user', new AbortController().signal);
    expect(r).toMatchObject({ ok: false, status: 429, diagnostic: expect.stringContaining(`provider_http_429:${code}:unclassified:type_`) });
    expect(JSON.stringify(r)).toContain('retry_after_seconds_13'); expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(f.fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([
    ['unsupported_parameter', 'PRIVATE_PARAM', 'unsupported_parameter:unclassified'],
    ['PRIVATE_CODE', 'model', 'unclassified:model'],
    ['PRIVATE_CODE', 'PRIVATE_PARAM', 'unclassified:unclassified'],
  ])('filters diagnostic code and parameter independently: %s/%s', async (code, param, expected) => {
    const f = fixture('chatgpt'); f.fetchImpl.mockImplementation(async () => Response.json({ error: { code, param, message: 'PRIVATE_MESSAGE' } }, { status: 400 }));
    const r = await callRelayProvider(f.deps, 'chatgpt', 'system', 'user', new AbortController().signal);
    expect(r).toMatchObject({ ok: false, diagnostic: `provider_http_400:${expected}` });
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
  });
  it('refuses task capacity overflow before charging, using the actual 2000-character database limit', async () => {
    for (const full of [{ result: 'x'.repeat(1750) }, { evidence: 'x'.repeat(1700) }]) {
      const f = fixture(); const orig = f.rest.getMockImplementation()!;
      f.rest.mockImplementation(async (...args) => args[2].startsWith('manager_tasks') ? { ok: true, data: [{ ...base, ...full }] } : orig(...args));
      expect(await relayToColleagueWith(f.deps, input())).toMatchObject({ ok: false, step: 'check task room', detail: expect.stringContaining('no room') });
      expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.deps.workbench.reserve).not.toHaveBeenCalled();
      expect(f.rest.mock.calls.some(c => c[1] === 'PATCH')).toBe(false);
    }
  });
  it('relay_to_colleague completes on a saved green task that already has result and evidence history', async () => {
    const savedResult = 'Earlier build notes for the welcome page. '.repeat(15).trim();
    const savedEvidence = 'Earlier receipt line for the welcome page. '.repeat(18).trim();
    const f = fixture('claude', { result: savedResult, evidence: savedEvidence, status: 'in_progress' });
    const r = await relayToColleagueWith(f.deps, input());
    expect(r).toMatchObject({ ok: true, text: 'Claude reply', detail: expect.stringContaining('reply saved and read back on task task-1') });
    expect(r.step).toBeUndefined();
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((f.fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const limit = Number(/At most (\d+) characters/.exec(sent.system)?.[1]);
    expect(limit).toBeGreaterThanOrEqual(200); expect(limit).toBeLessThanOrEqual(2000 - savedResult.length);
    const saved = f.row();
    expect(saved.result.startsWith(savedResult)).toBe(true); expect(saved.result).toContain('Claude reply');
    expect(saved.evidence.startsWith(savedEvidence)).toBe(true); expect(saved.evidence).toContain(`Relay receipt ${RID}: Anthropic response msg_1`);
    expect(saved.result.length).toBeLessThanOrEqual(2000); expect(saved.evidence.length).toBeLessThanOrEqual(2000);
    expect(saved.status).toBe('in_progress'); expect(saved.risk).toBe('green');
    const read = await readColleagueRepliesWith(f.deps, 'tok', 'task-1');
    expect(read.entries).toEqual([expect.objectContaining({ requestId: RID, state: 'replied', reply: 'Claude reply', receipt: expect.stringContaining('msg_1') })]);
  });
  it('names the step that could not complete', async () => {
    const owner = fixture(); owner.deps.workbench.verifyOwner = async () => { throw new Error('CANX_WORK_GRANT_REQUIRED'); };
    expect(await relayToColleagueWith(owner.deps, input())).toMatchObject({ ok: false, step: 'verify owner', detail: expect.stringContaining('Relay step "verify owner" could not complete') });
    expect(owner.fetchImpl).not.toHaveBeenCalled();

    const read = fixture(); read.rest.mockImplementation(async () => { throw new Error('network'); });
    expect(await relayToColleagueWith(read.deps, input())).toMatchObject({ ok: false, step: 'read task' });

    const green = fixture(); green.rest.mockImplementation(async () => ({ ok: true, data: [{ ...base, risk: 'yellow' }] }));
    expect(await relayToColleagueWith(green.deps, input())).toMatchObject({ ok: false, step: 'check task', detail: expect.stringContaining('Only a green task') });

    const call = fixture(); call.fetchImpl.mockImplementation(async () => Response.json({ error: { code: 'invalid_api_key' } }, { status: 401 }));
    expect(await relayToColleagueWith(call.deps, input())).toMatchObject({ ok: false, step: 'call colleague', detail: expect.stringContaining('invalid_api_key') });

    const save = fixture(); const orig = save.rest.getMockImplementation()!; let patches = 0;
    save.rest.mockImplementation(async (...a: Parameters<typeof orig>) => a[1] === 'PATCH' && ++patches === 2 ? { ok: false, data: [] } : orig(...a));
    expect(await relayToColleagueWith(save.deps, input())).toMatchObject({ ok: false, step: 'save reply', text: 'Claude reply', detail: expect.stringContaining('Relay step "save reply"') });
    expect(save.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('returns a full oversized response for recovery without silently cutting it or claiming saved success', async () => {
    const f = fixture(); f.fetchImpl.mockImplementation(async () => Response.json({ id: 'msg_long', stop_reason: 'end_turn', content: [{ type: 'text', text: 'x'.repeat(1801) }] }));
    expect(await relayToColleagueWith(f.deps, input())).toMatchObject({ ok: false, text: 'x'.repeat(1801), detail: expect.stringContaining('Nothing was truncated') });
    expect(f.row().result).toBe(base.result);
  });
  it.each(['claude', 'chatgpt'] as const)('supplies canonical goal contents to %s without pasting them in the message', async colleague => {
    const f = fixture(colleague);
    expect((await relayToColleagueWith(f.deps, input(colleague))).ok).toBe(true);
    const sent = JSON.parse((f.fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.stringify(sent)).toContain('GOAL_FIXTURE: prioritize checked prototypes');
    expect(f.rest.mock.calls.some(c => c[2].includes(`id=eq.${OFFICE_GOALS_ID}`) && c[2].includes('owner_id=eq.owner'))).toBe(true);
  });
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
  it('gives the colleague the latest Claude and ChatGPT handoffs as labelled data', async () => {
    const f = fixture(); const orig = f.rest.getMockImplementation()!;
    f.rest.mockImplementation(async (...a: Parameters<typeof orig>) => a[2].includes('id=eq.handoff-latest-chatgpt')
      ? { ok: true, data: [{ id: 'handoff-latest-chatgpt', title: 'Voice chat', detail: 'John wants Approve and Decline on the card.', updated_at: '2026-10-18T16:40:00Z' }] }
      : orig(...a));
    expect((await relayToColleagueWith(f.deps, input())).ok).toBe(true);
    const sent = JSON.parse((f.fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[0].content).toContain('ChatGPT [updated 2026-10-18T16:40:00Z] Voice chat: John wants Approve and Decline');
    expect(sent.messages[0].content).toContain("not John's approval");
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
