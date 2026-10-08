import { handleOfficeMcp } from "../../../src/lib/office-mcp.ts";
import plan from "../../../docs/office-connection-plan.json" with { type: "json" };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const clients = new Set((Deno.env.get("CANX_MCP_CLIENT_IDS") ?? "").split(",").map(s => s.trim()).filter(Boolean));

async function authorize(token: string): Promise<boolean> {
  // Empty client allowlist is deliberate until John authorizes the clients.
  if (!url || !key || clients.size === 0) return false;
  const headers = { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const call = (path: string, init: RequestInit = {}) => fetch(`${url}${path}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(8000) });
  const userResponse = await call("/auth/v1/user");
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  // Claims are inspected only after Auth validates the signature.
  const part = token.split(".")[1];
  if (!part) return false;
  const base = part.replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(atob(base + "=".repeat((4 - base.length % 4) % 4)));
  if (claims.iss !== `${url}/auth/v1` || claims.aud !== "authenticated" || claims.sub !== user.id || !clients.has(claims.client_id) || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now() || typeof claims.session_id !== "string") return false;
  const role = await call("/rest/v1/rpc/has_role", { method: "POST", body: JSON.stringify({ _user_id: user.id, _role: "owner" }) });
  if (!role.ok || await role.json() !== true) return false;
  // REQUIRED activation prerequisite. This RPC has NOT been installed yet.
  // It must bind auth.uid(), signed JWT session_id and client_id to an active
  // auth session and current OAuth grant. Missing/failed RPC always denies.
  const active = await call("/rest/v1/rpc/canx_mcp_session_active", { method: "POST", body: "{}" });
  return active.ok && await active.json() === true;
}

Deno.serve(request => {
  // Supabase's gateway removes /functions/v1 before forwarding to Deno.
  // Restore the public resource path without accepting arbitrary suffixes.
  const forwarded = new URL(request.url);
  if (forwarded.pathname === "/office-mcp" || forwarded.pathname.startsWith("/office-mcp/")) {
    forwarded.pathname = `/functions/v1${forwarded.pathname}`;
  }
  return handleOfficeMcp(new Request(forwarded, request), {
    resource: `${url}/functions/v1/office-mcp`,
    issuer: `${url}/auth/v1`,
    authorize,
    plan: () => structuredClone(plan),
  });
});
