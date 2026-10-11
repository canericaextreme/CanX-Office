import { safeConsentRedirect, validateConsentDetails, type ConsentDetails } from './office-mcp-consent.ts';

type Identity = 'chatgpt' | 'claude';
export interface AssistantConsentDeps {
  verify(token: string): Promise<{ ok: boolean; userId?: string; aal?: string }>;
  rpc(token: string, name: string, args: Record<string, unknown>): Promise<unknown>;
  provision(ownerId: string, identity: Identity): Promise<string>;
  mint(userId: string): Promise<string>;
  auth(path: string, token: string, body?: unknown): Promise<{ ok: boolean; body: unknown }>;
  endSession(token: string): Promise<void>;
}
export type AssistantConsentResult = { ok: true; details: ConsentDetails } | { ok: true; redirect: string } | { ok: false; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blocked = (): AssistantConsentResult => ({ ok: false, message: 'The isolated Office connection could not be completed. No access was confirmed. Start a fresh connection request.' });

/** Owner approves delegation; only the dedicated non-owner signs the OAuth consent.
 * Never return internal tokens, raw provider errors, or administrative credentials.
 */
export async function assistantConsentWith(deps: AssistantConsentDeps, input: {
  token: string; authorizationId: string; identity: Identity; action: 'read' | 'approve' | 'deny';
}): Promise<AssistantConsentResult> {
  let internalToken: string | undefined;
  try {
    if (!['chatgpt', 'claude'].includes(input.identity) || !['read', 'approve', 'deny'].includes(input.action) || !/^[A-Za-z0-9_-]{1,200}$/.test(input.authorizationId)) return blocked();
    const owner = await deps.verify(input.token);
    if (!owner.ok || owner.aal !== 'aal2' || !uuid.test(owner.userId ?? '')) return blocked();
    const args = { _authorization_id: input.authorizationId, _identity: input.identity };
    const preview = await deps.rpc(input.token, 'canx_mcp_consent_preview', args) as { assistant_user_id?: unknown; state?: unknown };
    const details = validateConsentDetails(preview, owner.userId!);
    if (!details || details.authorization_id !== input.authorizationId) return blocked();
    // Loading and denying do not provision users, mint sessions, bind Auth
    // authorizations, or auto-approve a pre-existing OAuth consent.
    if (input.action === 'read') return { ok: true, details };
    if (input.action === 'deny') {
      const redirect = new URL(details.redirect_uri);
      redirect.searchParams.delete('code');
      redirect.searchParams.set('error', 'access_denied');
      if (typeof preview.state === 'string') redirect.searchParams.set('state', preview.state);
      return { ok: true, redirect: redirect.href };
    }
    let agent = preview.assistant_user_id;
    if (agent == null) {
      agent = await deps.provision(owner.userId!, input.identity);
      if (typeof agent !== 'string' || !uuid.test(agent) || agent === owner.userId) return blocked();
      const bound = await deps.rpc(input.token, 'canx_mcp_bind_identity', { _identity: input.identity, _assistant_user: agent });
      if (bound !== agent) return blocked();
    }
    if (typeof agent !== 'string' || !uuid.test(agent) || agent === owner.userId) return blocked();
    internalToken = await deps.mint(agent);
    const path = `/oauth/authorizations/${encodeURIComponent(input.authorizationId)}`;
    const read = await deps.auth(path, internalToken);
    if (!read.ok) return blocked();
    let raw = read.body as { redirect_url?: unknown };
    if (!raw?.redirect_url) {
      const authorized = validateConsentDetails(read.body, agent);
      if (!authorized || authorized.authorization_id !== input.authorizationId || authorized.client.id !== details.client.id ||
          authorized.redirect_uri !== details.redirect_uri || authorized.scope !== details.scope) return blocked();
      const consent = await deps.auth(`${path}/consent`, internalToken, { action: 'approve' });
      if (!consent.ok) return blocked();
      raw = consent.body as { redirect_url?: unknown };
    }
    const redirect = safeConsentRedirect(raw?.redirect_url, details.redirect_uri);
    if (!redirect || !new URL(redirect).searchParams.get('code') || new URL(redirect).searchParams.has('error') ||
        (typeof preview.state === 'string' && new URL(redirect).searchParams.get('state') !== preview.state)) return blocked();
    // Rechecks owner MFA and the actual Auth authorization/user/client/resource.
    // A code is withheld unless durable scoped delegation was saved.
    const saved = await deps.rpc(input.token, 'canx_approve_office_work', args);
    if (saved !== details.client.id) return blocked();
    return { ok: true, redirect };
  } catch { return blocked(); }
  finally {
    // scope=local ends this short internal session only, not OAuth sessions.
    if (internalToken) await deps.endSession(internalToken).catch(() => undefined);
  }
}
