import { it, expect, vi } from 'vitest';
import { liveElsieTask } from './elsie-task-loop.server';
const input = { requestId: '20000000-0000-4000-8000-000000000001', taskId: '20000000-0000-4000-8000-000000000002', ruleId: '20000000-0000-4000-8000-000000000003', specNoteId: 'fixture-spec', colleague: 'claude', instruction: 'Write a two-sentence synthetic readiness explanation.' };
function fixture(options: { denied?: boolean; budget?: boolean; settlement?: boolean; oversized?: boolean; providerRefused?: boolean; incomplete?: boolean } = {}) {
  let version = 0;
  const rows = new Map<string, { data: Record<string, unknown>; version: string }>();
  const save = (c: string, id: string, data: Record<string, unknown>) => rows.set(`${c}/${id}`, { data: { id, owner_id: 'owner', ...data }, version: String(++version) });
  save('manager_tasks', input.taskId, { risk: 'green', status: 'open', worker: 'Office Manager' });
  save('office_notes', input.specNoteId, { detail: 'Fixture request' });
  save('astra_memory', input.ruleId, { active: true, content: 'Fixture rule' });
  save('ai_limits', 'owner', { max_calls_per_day: 20 });
  let providers = 0;
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const address = String(url); const body = JSON.parse(String(init?.body ?? '{}'));
    if (address.startsWith('https://api.')) {
      providers++;
      if (options.providerRefused) return Response.json({ error: { code: 'unsupported_parameter', param: 'model', message: 'SENSITIVE FIXTURE MUST NOT BE SAVED' } }, { status: 400 });
      if (options.incomplete) return Response.json({ id: 'incomplete-response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] });
      expect(body.tools).toBeUndefined();
      expect(JSON.stringify(body)).toContain('Fixture request'); expect(JSON.stringify(body)).toContain('Fixture rule');
      if (address.includes('anthropic')) return Response.json({ id: 'worker-response', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Actual fixture worker output' }] });
      expect(body.model).toBe('elsie-configured-model');
      expect(body.instructions).toContain('You are Elsie, the CanX Office Manager');
      return Response.json({ id: `elsie-${providers}`, status: 'completed', output_text: options.oversized ? 'x'.repeat(1801) : 'Actual fixture Elsie output' });
    }
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer real-caller', apikey: 'public' });
    if (address.endsWith('/canx_office_records')) return Response.json({ records: rows.has(`${body._collection}/${body._id}`) ? [rows.get(`${body._collection}/${body._id}`)] : [] });
    if (address.endsWith('/canx_write_office_record')) {
      const old = rows.get(`office_notes/${body._id}`);
      if (old ? old.version !== body._expected_version : body._expected_version !== null) return Response.json({ error: 'conflict' }, { status: 409 });
      save('office_notes', body._id, body._data); return Response.json({ saved: true });
    }
    if (address.endsWith('/canx_mcp_relay_reserve')) {
      if (options.budget) return Response.json([{ allowed: false, reason: 'budget_limit' }]);
      const id = `reservation-${providers}`; save('ai_usage', id, { outcome: 'reserved', estimated_cents: 4 });
      return Response.json([{ allowed: true, reservation_id: id, remaining_today: 5 }]);
    }
    if (address.endsWith('/canx_mcp_relay_settle')) {
      if (!options.settlement) save('ai_usage', body._reservation_id, { outcome: body._outcome, estimated_cents: 4, settled_at: 'fixture-time' });
      return Response.json(null);
    }
    throw Error(`Unexpected request ${address}`);
  });
  const verify = vi.fn(async () => options.denied ? { ok: false as const, reason: 'expired_session' as const, message: 'Expired' } : { ok: true as const, userId: 'owner', email: '', aal: 'aal1' });
  const run = () => liveElsieTask({ url: 'https://fixture.supabase.co', publishableKey: 'public' }, verify, fetcher, 'real-caller', input);
  return { run, fetcher, rows, providers: () => providers };
}
it('wires real RPC note CAS, existing budget, configured Elsie/worker providers and settlement readback through all phases', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture-only'); vi.stubEnv('OPENAI_MODEL', 'elsie-configured-model'); vi.stubEnv('OPENAI_TEXT_MODEL', 'writing-model'); vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-only'); vi.stubEnv('ANTHROPIC_MODEL', 'worker-model');
  try {
    const f = fixture();
    expect(await f.run()).toMatchObject({ phase: 'planned' }); expect(await f.run()).toMatchObject({ phase: 'worked' });
    expect(await f.run()).toMatchObject({ phase: 'complete', ok: true, workerText: 'Actual fixture worker output' });
    expect(await f.run()).toMatchObject({ phase: 'complete', ok: true }); expect(f.providers()).toBe(3);
    expect(f.fetcher.mock.calls.filter(c => String(c[0]).endsWith('/canx_mcp_relay_reserve'))).toHaveLength(3);
    expect(f.fetcher.mock.calls.filter(c => String(c[0]).endsWith('/canx_mcp_relay_settle'))).toHaveLength(3);
  } finally { vi.unstubAllEnvs(); }
});
it.each(['budget', 'settlement', 'oversized'] as const)('fails closed for %s and never replays the claimed provider phase', async condition => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture-only'); vi.stubEnv('OPENAI_MODEL', 'elsie-configured-model');
  try {
    const f = fixture({ [condition]: true }); expect(await f.run()).toMatchObject({ ok: false, phase: 'failed' });
    const calls = f.providers(); await f.run(); expect(f.providers()).toBe(calls); expect(calls).toBe(condition === 'budget' ? 0 : 1);
  } finally { vi.unstubAllEnvs(); }
});
it.each(['providerRefused', 'incomplete'] as const)('saves a bounded diagnostic for %s without private provider messages or replay', async condition => {
  vi.stubEnv('OPENAI_API_KEY', 'fixture-only'); vi.stubEnv('OPENAI_MODEL', 'elsie-configured-model');
  try {
    const f = fixture({ [condition]: true }); const result = await f.run();
    expect(result).toMatchObject({ ok: false, phase: 'failed', detail: expect.stringContaining(condition === 'providerRefused' ? 'provider_http_400:unsupported_parameter:model' : 'provider_incomplete:max_output_tokens') });
    expect(JSON.stringify(result)).not.toContain('SENSITIVE'); expect(JSON.stringify([...f.rows.values()])).not.toContain('SENSITIVE');
    await f.run(); expect(f.providers()).toBe(1);
  } finally { vi.unstubAllEnvs(); }
});
