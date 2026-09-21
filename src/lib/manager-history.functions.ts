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
  const r = await deps.read(token, `manager_changes?owner_id=eq.${encodeURIComponent(v.userId)}&entity=eq.manager_conversation&select=entity_id,after&order=id.desc&limit=100`);
  if (!r.ok || !Array.isArray(r.body)) return { ok: false as const, messages: [] as SavedMessage[], message: "Saved conversation could not be loaded." };
  const messages = r.body.map((row: { entity_id?: string; after?: Record<string,unknown> }) => cleanSavedMessage({ ...row.after, id: row.entity_id })).filter((m): m is SavedMessage => !!m).reverse();
  return { ok: true as const, messages, message: "Recent conversation restored from your account." };
}
export async function saveHistoryWith(deps: HistoryDeps, token: string, raw: unknown) {
  const v = await deps.verify(token);
  if (!v.ok) return { ok: false, message: v.message };
  const message = cleanSavedMessage(raw);
  if (!message) return { ok: false, message: "Conversation message is invalid." };
  const existing = await deps.read(token, `manager_changes?owner_id=eq.${encodeURIComponent(v.userId)}&entity=eq.manager_conversation&entity_id=eq.${encodeURIComponent(message.id)}&select=id&limit=1`);
  if (!existing.ok) return { ok: false, message: "Conversation could not be saved." };
  if (Array.isArray(existing.body) && existing.body.length) return { ok: true, message: "Conversation saved." };
  const r = await deps.write(token, { owner_id: v.userId, entity: "manager_conversation", entity_id: message.id, action: `conversation.${message.role}`, before: {}, after: { role: message.role, content: message.content } });
  return { ok: r.ok, message: r.ok ? "Conversation saved." : "Conversation could not be saved. Keep this window open." };
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
