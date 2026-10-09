import type { BackendConfig, OwnerVerification } from './canx-backend.server';
import type { RelayDeps } from './colleague-relay';
import type { JsonObject } from './manager-work.functions';

/** Server-only wiring: Office keys come from server env, never from callers. */
export async function relayWorkbench(config: BackendConfig, verify: (t: string) => Promise<OwnerVerification>, f: typeof fetch): Promise<RelayDeps> {
  const backend = await import('./canx-backend.server');
  const env = (k: string) => process.env[k]?.trim() || undefined;
  return {
    fetchImpl: f,
    openaiKey: env('OPENAI_API_KEY'), openaiModel: env('OPENAI_TEXT_MODEL') ?? env('OPENAI_MODEL'),
    anthropicKey: env('ANTHROPIC_API_KEY'), anthropicModel: env('ANTHROPIC_MODEL'),
    workbench: {
      verifyOwner: verify,
      reserve: (t, c) => backend.reserveAiCallWith(config, t, c, f),
      settle: (t, id, o) => backend.settleAiCallWith(config, t, id, o, f),
      rest: async <T>(t: string, method: string, path: string, body?: JsonObject) => {
        const init: RequestInit = { method };
        if (body && method !== 'GET') init.body = JSON.stringify(body);
        const r = await backend.restRequest(config, t, path, init, f);
        return r.ok ? { ok: true, data: r.body as unknown as T } : { ok: false, error: `Request failed (${r.status}).` };
      },
      ensureBudget: async (t, ownerId) => {
        const r = await backend.restRequest(config, t, 'rpc/ensure_manager_ai_budget', { method: 'POST', body: JSON.stringify({ _owner_id: ownerId }) }, f);
        return r.ok ? { ok: true } : { ok: false, error: 'Budget setup failed.' };
      },
    },
  };
}
