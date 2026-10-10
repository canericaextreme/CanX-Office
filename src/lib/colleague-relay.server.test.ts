import { it, expect, vi } from 'vitest';
import { relayWorkbench } from './colleague-relay.server';

it('routes delegated reads, CAS saves and budget calls through working-grant RPCs with the caller token', async () => {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ Authorization: 'Bearer caller-token' });
    if (url.endsWith('/canx_office_records')) return Response.json({ records: [{ data: { id: 'task' } }] });
    if (url.endsWith('/canx_mcp_relay_reserve')) return Response.json([{ allowed: true, reservation_id: 'reservation', remaining_today: 2 }]);
    return Response.json([]);
  });
  const deps = await relayWorkbench({ url: 'https://fixture.supabase.co', publishableKey: 'public' }, async () => ({ ok: true, userId: 'owner', email: '', aal: 'aal1' }), fetcher as unknown as typeof fetch);
  const read = await deps.workbench.rest('caller-token', 'GET', 'manager_tasks?id=eq.task&owner_id=eq.owner');
  expect(read).toEqual({ ok: true, data: [{ id: 'task' }] });
  await deps.workbench.rest('caller-token', 'GET', 'office_notes?id=eq.direction&owner_id=eq.owner');
  await deps.workbench.rest('caller-token', 'PATCH', 'manager_tasks?id=eq.task&updated_at=eq.2026-10-09T00%3A00%3A00Z', { evidence: 'claim', updated_at: 'next' });
  expect(JSON.parse(fetcher.mock.calls[2]![1].body as string)).toEqual({ _task_id: 'task', _expected_at: '2026-10-09T00:00:00Z', _patch: { evidence: 'claim', updated_at: 'next' } });
  expect((await deps.workbench.ensureBudget('caller-token', 'owner')).ok).toBe(true);
  expect((await deps.workbench.reserve('caller-token', 4)).allowed).toBe(true);
  await deps.workbench.settle('caller-token', 'reservation', 'ok');
  expect(fetcher.mock.calls.map(c => c[0])).toEqual([
    'https://fixture.supabase.co/rest/v1/rpc/canx_office_records',
    'https://fixture.supabase.co/rest/v1/rpc/canx_office_records',
    'https://fixture.supabase.co/rest/v1/rpc/canx_mcp_relay_save',
    'https://fixture.supabase.co/rest/v1/rpc/canx_office_records',
    'https://fixture.supabase.co/rest/v1/rpc/canx_mcp_relay_reserve',
    'https://fixture.supabase.co/rest/v1/rpc/canx_mcp_relay_settle',
  ]);
});

it('fails closed when the scoped read or agreed budget is unavailable', async () => {
  const fetcher = vi.fn(async () => Response.json({ records: [] }));
  const deps = await relayWorkbench({ url: 'https://fixture.supabase.co', publishableKey: 'public' }, async () => ({ ok: true, userId: 'owner', email: '', aal: 'aal1' }), fetcher as unknown as typeof fetch);
  expect((await deps.workbench.ensureBudget('t', 'owner')).ok).toBe(false);
  expect((await deps.workbench.rest('t', 'PATCH', 'office_notes?id=eq.note', {})).ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
