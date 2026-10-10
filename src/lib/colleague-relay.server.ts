import type { BackendConfig, OwnerVerification } from './canx-backend.server';
import type { RelayDeps } from './colleague-relay';
import type { JsonObject } from './manager-work.functions';

/** Server-only wiring: Office keys come from server env, never from callers. */
export async function relayWorkbench(config: BackendConfig, verify: (t: string) => Promise<OwnerVerification>, f: typeof fetch): Promise<RelayDeps> {
  const backend = await import('./canx-backend.server');
  const env = (k: string) => process.env[k]?.trim() || undefined;
  // Delegated tokens use the working-grant RPCs. Raw table access is
  // deliberately blocked; never substitute a service-role token here.
  const rpc = async (t: string, name: string, args: JsonObject) =>
    backend.restRequest(config, t, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }, f);
  const budgetFetch: typeof fetch = (url, init) => {
    const address = String(url);
    return f(address.replace('/rpc/reserve_ai_call', '/rpc/canx_mcp_relay_reserve')
      .replace('/rpc/settle_ai_call', '/rpc/canx_mcp_relay_settle'), init);
  };
  return {
    fetchImpl: f,
    openaiKey: env('OPENAI_API_KEY'), openaiModel: env('OPENAI_TEXT_MODEL') ?? env('OPENAI_MODEL'),
    anthropicKey: env('ANTHROPIC_API_KEY'), anthropicModel: env('ANTHROPIC_MODEL'),
    workbench: {
      verifyOwner: verify,
      reserve: (t, c) => backend.reserveAiCallWith(config, t, c, budgetFetch),
      settle: (t, id, o) => backend.settleAiCallWith(config, t, id, o, budgetFetch),
      rest: async <T>(t: string, method: string, path: string, body?: JsonObject) => {
        const [table, query = ''] = path.split('?');
        const params = new URLSearchParams(query);
        const id = params.get('id')?.replace(/^eq\./, '');
        if (!id || !['manager_tasks', 'office_notes'].includes(table ?? '')) return { ok: false, error: 'Unsupported relay record.' };
        if (method === 'GET') {
          const r = await rpc(t, 'canx_office_records', { _collection: table!, _id: id, _limit: 1 });
          const records = (r.body as { records?: { data: unknown }[] } | null)?.records;
          return r.ok && Array.isArray(records)
            ? { ok: true, data: records.map(row => row.data) as T }
            : { ok: false, error: 'Relay record read failed.' };
        }
        if (method !== 'PATCH' || table !== 'manager_tasks' || !body) return { ok: false, error: 'Unsupported relay write.' };
        const r = await rpc(t, 'canx_mcp_relay_save', {
          _task_id: id, _expected_at: params.get('updated_at')?.replace(/^eq\./, '') ?? null, _patch: body,
        });
        return r.ok ? { ok: true, data: r.body as unknown as T } : { ok: false, error: `Request failed (${r.status}).` };
      },
      ensureBudget: async (t, ownerId) => {
        // Read the agreed limits; a relay must never initialize or raise them.
        const r = await rpc(t, 'canx_office_records', { _collection: 'ai_limits', _id: ownerId, _limit: 1 });
        const rows = (r.body as { records?: unknown[] } | null)?.records;
        return r.ok && rows?.length === 1 ? { ok: true } : { ok: false, error: 'Budget setup failed.' };
      },
    },
  };
}
