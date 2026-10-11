import { createServerFn } from "@tanstack/react-start";
import { cleanGrantInput, type GrantRow, type HistoryRow } from "./office-view-owner";
import { cleanConnectionRows, type ConnectionRow } from "./assistant-connections";

const tok = (v: unknown) => (typeof (v as { accessToken?: unknown })?.accessToken === "string" ? (v as { accessToken: string }).accessToken.slice(0, 4000) : "");
const rpc = async (b: typeof import("./canx-backend.server"), token: string, fn: string, args: Record<string, unknown>) => {
  const config = b.readBackendConfig();
  if (!config) return { ok: false as const, status: 0, body: null as unknown };
  const r = await b.restRequest(config, token, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  return { ok: r.ok, status: r.status, body: r.body };
};

/** Status and history. Owner session only; never returns credentials or images. */
export const getViewAccess = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(async ({ data }): Promise<{ ok: true; grants: GrantRow[]; history: HistoryRow[]; connections: ConnectionRow[] | null } | { ok: false; message: string }> => {
    const b = await import("./canx-backend.server");
    const who = await b.verifySignedIn(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message };
    const [g, h, c] = await Promise.all([rpc(b, data.accessToken, "canx_view_grants_status", {}), rpc(b, data.accessToken, "canx_view_history", { _limit: 100 }), rpc(b, data.accessToken, "canx_mcp_connection_status", {})]);
    if (!g.ok || !Array.isArray(g.body)) return { ok: false, message: "Viewing access is not installed or could not be read. Nothing is switched on. Missing information is not the same as no access." };
    // null = not installed or unreadable; shown as "could not be checked", never as disconnected.
    return { ok: true, connections: c.ok ? cleanConnectionRows(c.body) : null, grants: g.body as GrantRow[], history: h.ok && Array.isArray(h.body) ? (h.body as Record<string, unknown>[]).map((x) => ({ at: String(x["at"]), action: String(x["action"]), assistant: String(x["assistant"]) })) : [] };
  });

/** Authorise or renew. Needs the authenticator: the database refuses anything weaker. */
export const setViewAccess = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v), input: (v as { input?: unknown })?.input }))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const clean = cleanGrantInput(data.input);
    if (!clean.ok) return { ok: false, message: clean.message };
    const b = await import("./canx-backend.server");
    const who = await b.verifyOwner(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message };
    const { assistant, viewerUserId, rooms, days, scopes } = clean.value;
    const r = await rpc(b, data.accessToken, "canx_view_grant_set", { _assistant: assistant, _viewer_user: viewerUserId, _rooms: rooms, _days: days, _scopes: scopes });
    return r.ok ? { ok: true, message: "Viewing access saved. It is view-only and can be revoked at any time." } : { ok: false, message: "Viewing access was not saved. Check the account id and that the setup has been installed. Nothing changed." };
  });

/** Switch one assistant off. Works without the authenticator on purpose: turning access off must always be easy. */
export const revokeViewAccess = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v), assistant: typeof (v as { assistant?: unknown })?.assistant === "string" ? (v as { assistant: string }).assistant : "" }))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    if (!["claude", "chatgpt", "elsie"].includes(data.assistant)) return { ok: false, message: "Unknown assistant." };
    const b = await import("./canx-backend.server");
    const who = await b.verifySignedIn(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message };
    const r = await rpc(b, data.accessToken, "canx_view_grant_revoke", { _assistant: data.assistant });
    return r.ok ? { ok: true, message: `${data.assistant} can no longer look at the Office. The other assistants are unchanged.` } : { ok: false, message: "Could not revoke. If this assistant was never authorised there is nothing to revoke." };
  });
