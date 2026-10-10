/**
 * Owner-side helpers for the "Assistant viewing access" panel. Pure: no network.
 * The database decides what is allowed; this file only validates input shape and words the status.
 */
import { CAPTURE_ROOM_LABELS } from "./room-capture-meta";

export const VIEW_ASSISTANTS = ["claude", "chatgpt", "elsie"] as const;
export type ViewAssistant = (typeof VIEW_ASSISTANTS)[number];
export const VIEW_SCOPES = ["view_room_images", "read_room_information"] as const;
export type ViewScope = (typeof VIEW_SCOPES)[number];
export const SCOPE_WORDS: Record<ViewScope, string> = { view_room_images: "See pictures of rooms", read_room_information: "Read what is saved in rooms" };
/** Rooms Office protects with the authenticator. Granting them is the deliberate, one-time step. */
export const PROTECTED_ROUTES = ["/communications", "/legal", "/subscriptions", "/finance", "/projects"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GrantInput { assistant: ViewAssistant; viewerUserId: string; rooms: string[]; days: number; scopes: ViewScope[] }

export function cleanGrantInput(raw: unknown): { ok: true; value: GrantInput } | { ok: false; message: string } {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (!VIEW_ASSISTANTS.includes(v["assistant"] as ViewAssistant)) return { ok: false, message: "Choose Claude, ChatGPT or Elsie." };
  if (typeof v["viewerUserId"] !== "string" || !UUID.test(v["viewerUserId"])) return { ok: false, message: "Enter the viewing account's id (a UUID)." };
  const rooms = Array.isArray(v["rooms"]) ? [...new Set(v["rooms"].filter((r): r is string => typeof r === "string"))] : [];
  if (rooms.length === 0 || rooms.some((r) => !(r in CAPTURE_ROOM_LABELS))) return { ok: false, message: "Pick at least one known Office room." };
  const scopes = Array.isArray(v["scopes"]) ? [...new Set(v["scopes"])] : [];
  if (scopes.length === 0 || scopes.some((s) => !VIEW_SCOPES.includes(s as ViewScope))) return { ok: false, message: "Pick what the assistant may do: pictures, saved information, or both." };
  const days = v["days"];
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 90) return { ok: false, message: "Access must last between 1 and 90 days." };
  return { ok: true, value: { assistant: v["assistant"] as ViewAssistant, viewerUserId: v["viewerUserId"], rooms, days, scopes: scopes as ViewScope[] } };
}

export interface GrantRow { assistant: string; viewer_user_id?: string; enabled: boolean; rooms: string[]; scopes: string[]; expires_at: string; delegated_at: string; revoked_at: string | null; captures_last_day: number; last_used_at: string | null }

export function describeGrant(row: GrantRow | undefined, now = Date.now()): { state: "off" | "on" | "expired" | "revoked"; label: string } {
  if (!row) return { state: "off", label: "Not authorised. This assistant cannot look at any room." };
  if (row.revoked_at) return { state: "revoked", label: `Revoked ${new Date(row.revoked_at).toLocaleString()}. Pictures taken earlier can no longer be retrieved.` };
  if (Date.parse(row.expires_at) <= now) return { state: "expired", label: `Expired ${new Date(row.expires_at).toLocaleDateString()}. Authorise again to renew.` };
  return { state: row.enabled ? "on" : "off", label: row.enabled ? `On until ${new Date(row.expires_at).toLocaleDateString()}. View-only: it cannot change, spend, delete or build anything.` : "Off." };
}

export function protectedRoomsIn(rooms: string[]): string[] { return rooms.filter((r) => (PROTECTED_ROUTES as readonly string[]).includes(r)); }
export interface HistoryRow { at: string; action: string; assistant: string }
