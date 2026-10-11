import { assistantConsentWith, type AssistantConsentDeps } from '../../../src/lib/office-assistant-consent.ts';
import { verifyOwnerWith } from '../../../src/lib/canx-backend.server.ts';
import { requestConsentDetails } from '../../../src/lib/office-mcp-consent-http.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const config = { url, publishableKey: key };
async function request(path: string, bearer: string, apiKey: string, body?: unknown) {
  const r = await fetch(`${url}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: apiKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(10_000) });
  const value = await r.json().catch(() => null);
  if (!r.ok) throw Error('Consent service unavailable');
  return value;
}
const deps: AssistantConsentDeps = {
  verify: token => verifyOwnerWith(config, token, (u, i) => fetch(u, i)),
  rpc: (token, name, args) => request(`/rest/v1/rpc/${name}`, token, key, args),
  async provision(ownerId, identity) {
    // Reserved domain: no mailbox, password, invitations or email delivery.
    const email = `canx-${ownerId}-${identity}@assistant.invalid`;
    try {
      const user = await request('/auth/v1/admin/users', service, service, { email, email_confirm: true,
        app_metadata: { canx_owner_id: ownerId, canx_assistant: identity } });
      if (typeof user?.id !== 'string') throw Error('Identity unavailable');
      return user.id;
    } catch {
      // Recover only an account from an interrupted provision. Database bind
      // verifies immutable admin metadata, no roles, and no viewer identity.
      const link = await request('/auth/v1/admin/generate_link', service, service, { type: 'magiclink', email });
      if (typeof link?.id !== 'string') throw Error('Identity unavailable');
      return link.id;
    }
  },
  async mint(userId) {
    const user = await request(`/auth/v1/admin/users/${userId}`, service, service);
    if (typeof user?.email !== 'string') throw Error('Identity unavailable');
    const link = await request('/auth/v1/admin/generate_link', service, service, { type: 'magiclink', email: user.email });
    if (link?.id !== userId || typeof link?.hashed_token !== 'string') throw Error('Identity mismatch');
    const session = await request('/auth/v1/verify', key, key, { type: 'magiclink', token_hash: link.hashed_token });
    if (session?.user?.id !== userId || typeof session?.access_token !== 'string') throw Error('Identity mismatch');
    return session.access_token;
  },
  auth: (path, token, body) => requestConsentDetails(config, path, token, body, (u, i) => fetch(u, i)),
  async endSession(token) {
    await request('/auth/v1/logout?scope=local', token, key, {});
  },
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { ok: false, message: 'POST required.' });
  const token = /^Bearer (\S+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!token || token.length > 8192) return json(401, { ok: false, message: 'Owner sign-in required.' });
  if (!url || !key || !service) return json(503, { ok: false, message: 'Isolated consent service is not configured.' });
  if (Number(req.headers.get('Content-Length')) > 2048) return json(413, { ok: false, message: 'Request too large.' });
  const text = await req.text();
  if (text.length > 2048) return json(413, { ok: false, message: 'Request too large.' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { ok: false, message: 'Invalid request.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['authorizationId', 'identity', 'action'].includes(k)) ||
      typeof body.authorizationId !== 'string' || !['chatgpt', 'claude'].includes(body.identity) || !['read', 'approve', 'deny'].includes(body.action)) return json(400, { ok: false, message: 'Invalid request.' });
  const result = await assistantConsentWith(deps, { token, ...body });
  return json(result.ok ? 200 : 403, result);
});
