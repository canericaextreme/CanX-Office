/** Owner-scoped conversation events in the existing append-only private log. */
import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
export interface SavedMessage { id: string; role: "user" | "assistant"; content: string }
export interface HistoryDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  read: (token: string, path: string) => Promise<{ ok: boolean; body: unknown }>;
  write: (token: string, body: Record<string, unknown>) => Promise<{ ok: boolean }>;
}
export function cleanSavedMessage(raw: unknown): SavedMessage | null {
  const m = raw as Partial<SavedMessage> | null;
  if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) return null;
  if (typeof m.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)) return null;
  return { id: m.id, role: m.role, content: m.content.slice(0,12000) };
}
export async function readHistoryWith(deps: HistoryDeps, token: string) {
  const v = await deps.verify(token);
  if (!v.ok) return { ok: false as const, messages: [] as SavedMessage[], message: v.message };
  const { ASTRA_CONVERSATION_KEY, RECENT_RETENTION_MS, HEALTH_PROBE } = await import("./astra-continuity");
  const cutoff = encodeURIComponent(new Date(Date.now() - RECENT_RETENTION_MS).toISOString());
  const messages: SavedMessage[] = [];
  // Page the entire working window, not merely the last 20 or 40 lines.
  for (let offset = 0; offset < 10000; offset += 500) {
    const r = await deps.read(token, `astra_recent_context?owner_id=eq.${encodeURIComponent(v.userId)}&conversation_key=eq.${ASTRA_CONVERSATION_KEY}&created_at=gte.${cutoff}&select=id,role,content,created_at&order=created_at.asc,id.asc&limit=500&offset=${offset}`);
    if (!r.ok || !Array.isArray(r.body)) return { ok: false as const, messages: [] as SavedMessage[], message: "Saved conversation could not be loaded. Reconnect and retry." };
    for (const row of r.body) {
      const m = cleanSavedMessage({ ...row, id: String(row.id) });
      if (m && m.content !== HEALTH_PROBE) messages.push(m);
    }
    if (r.body.length < 500) return { ok: true as const, messages, message: messages.length ? "Saved exchanges from the last ten hours restored." : "No saved exchanges in the last ten hours." };
  }
  return { ok: false as const, messages: [] as SavedMessage[], message: "Conversation exceeds the restore limit. History was not silently truncated." };
}
/** Legacy callers may still be open on another device. Never archive raw turns. */
export async function saveHistoryWith(_deps: HistoryDeps, _token: string, _raw: unknown) {
  return { ok: false, message: "Automatic conversation saving is off. Say Save this conversation to save an office summary." };
}
export async function historyDeps(): Promise<HistoryDeps> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verify: (token) => backend.verifyOwnerWith(config, token),
    read: async (token,path) => config ? backend.restRequest(config,token,path) : { ok:false, body:null },
    write: async (token,body) => config ? backend.restRequest(config,token,"manager_changes",{ method:"POST", body:JSON.stringify(body) }) : { ok:false },
  };
}
export const loadConversation = createServerFn({ method:"POST" })
  .inputValidator((raw: { accessToken: string }) => ({ accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0,4000) : "" }))
  .handler(async ({data}) => readHistoryWith(await historyDeps(),data.accessToken));
export const saveConversationMessage = createServerFn({ method:"POST" })
  .inputValidator((raw: { accessToken: string; message: SavedMessage }) => ({ accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0,4000) : "", message: cleanSavedMessage(raw?.message) }))
  .handler(async ({data}) => saveHistoryWith(await historyDeps(),data.accessToken,data.message));
