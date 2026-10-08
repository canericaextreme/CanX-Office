import type { OwnerVerification } from "./canx-backend.server";

export interface ConsentDetails {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string };
  user: { id: string };
  scope: string;
}
export interface ConsentDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  auth: (path: string, token: string, body?: unknown) => Promise<{ ok: boolean; body: unknown; status?: number }>;
  register: (token: string, authorizationId: string, identity: "chatgpt" | "claude") => Promise<boolean>;
}
export function validateConsentDetails(value: unknown, ownerId: string): ConsentDetails | null {
  const d = value as ConsentDetails | null;
  if (!d || typeof d.authorization_id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(d.authorization_id) ||
      !/^[0-9a-f-]{36}$/i.test(d.client?.id ?? "") || typeof d.client?.name !== "string" ||
      d.user?.id !== ownerId || typeof d.scope !== "string" || typeof d.redirect_uri !== "string") return null;
  try {
    const uri = new URL(d.redirect_uri);
    if (uri.protocol !== "https:" || uri.username || uri.password || uri.hash) return null;
  } catch { return null; }
  if (d.scope.split(/\s+/).filter(Boolean).some(s => !["openid", "email", "profile", "offline_access"].includes(s))) return null;
  return { authorization_id: d.authorization_id, redirect_uri: d.redirect_uri, client: { id: d.client.id, name: d.client.name.slice(0,160) }, user: { id: ownerId }, scope: d.scope };
}
export function safeConsentRedirect(value: unknown, registered: string): string | null {
  try {
    const target = new URL(String(value));
    const base = new URL(registered);
    if (target.protocol !== "https:" || target.username || target.password || target.hash ||
        target.origin !== base.origin || target.pathname !== base.pathname) return null;
    // Preserve any registered query parameters exactly; OAuth may add code/state.
    for (const [key,value] of base.searchParams) if (target.searchParams.get(key) !== value) return null;
    return target.href;
  } catch { return null; }
}
export async function readConsentWith(deps: ConsentDeps, token: string, authorizationId: string) {
  const owner = await deps.verify(token).catch(() => null);
  if (!owner?.ok || owner.aal !== "aal2") return { ok: false as const, message: "Confirm your owner authenticator to authorize an Office connection." };
  const response = await deps.auth(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`,token).catch(() => null);
  if (!response?.ok) {
    const status = response?.status;
    const cause = !response ? "request unavailable" : status === 401 ? "Office session rejected" : status === 404 || status === 410 ? "request missing or expired" : status === 403 ? "request refused" : "authorization service unavailable";
    return { ok: false as const, message: `Connection details could not be read: ${cause}${typeof status === "number" ? ` (HTTP ${status})` : ""}. Office access remains blocked.` };
  }
  const details = validateConsentDetails(response.body,owner.userId);
  if (!details || details.authorization_id !== authorizationId) return { ok: false as const, message: "Connection details were received but did not match the expected owner, request, callback or permissions. Office access remains blocked." };
  return { ok: true as const, details };
}
export async function decideConsentWith(deps: ConsentDeps, input: { token: string; authorizationId: string; identity: "chatgpt" | "claude"; approve: boolean }) {
  const read = await readConsentWith(deps,input.token,input.authorizationId);
  if (!read.ok) return read;
  const response = await deps.auth(`/oauth/authorizations/${encodeURIComponent(input.authorizationId)}/consent`,input.token,{ action: input.approve ? "approve" : "deny" }).catch(() => null);
  const raw = response?.body as { redirect_url?: unknown } | undefined;
  const redirect = response?.ok ? safeConsentRedirect(raw?.redirect_url,read.details.redirect_uri) : null;
  if (!redirect) return { ok: false as const, message: "The authorization response was not valid. Office access was not enabled." };
  if (input.approve && !await deps.register(input.token,input.authorizationId,input.identity).catch(() => false)) return { ok: false as const, message: "Your Office permission could not be saved. Access remains blocked; start the connection again." };
  return { ok: true as const, redirect };
}
