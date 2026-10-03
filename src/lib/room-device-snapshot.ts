/**
 * Device-source snapshot — CLIENT-SAFE, PURE.
 *
 * Some room sources live only on John's device (Office Team roster, Idea Lab
 * scores, post-update room checks). The server cannot see them, so the
 * device collects a bounded, structured summary of that existing saved state
 * just before each snapshot/Elsie request and sends it with route + time.
 *
 * Never collected: secrets, tokens, form drafts, free-text notes. The server
 * treats it as UNTRUSTED DATA reported by the device, accepts it only for the
 * same room and when fresh, and otherwise reports "device-unavailable".
 */
import { TEAM_STORAGE_KEY, parseTeam } from "./office-team";

export const DEVICE_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const ROOM_CHECKS_KEY = "canx-room-connection-checks-v1";
const IDEA_KEYS = { evidence: "canx-idea-lab-evidence", overrides: "canx-idea-lab-overrides", proposals: "canx-idea-lab-proposals" } as const;

export interface DeviceSourceSummary { count: number; items: string[]; detail: string }
export interface DeviceSnapshot { route: string; collectedAt: string; sources: Record<string, DeviceSourceSummary> }

const s = (v: unknown, max = 120) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
type Store = Pick<Storage, "getItem">;
const json = (store: Store, key: string): unknown => { try { const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return undefined; } };
const sizeOf = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);

/** Device source keys per room route (mirrors the "device" sources declared in room-snapshot.ts). */
export const DEVICE_SOURCE_KEYS: Record<string, string[]> = {
  "/idea-garage": ["idea-lab"],
  "/office-team": ["team"],
  "/build-testing": ["room-checks"],
  "/health": ["room-checks"],
};

function collectOne(key: string, store: Store): DeviceSourceSummary | null {
  if (key === "team") {
    const raw = json(store, TEAM_STORAGE_KEY);
    if (raw === undefined) return null;
    const team = raw ? parseTeam(raw) : [];
    return { count: team.length, items: team.slice(0, 12).map((m) => `${s(m.name, 60)} — ${s((m as { role?: unknown }).role, 60) || "role not set"}`), detail: raw ? "saved roster on this device" : "no roster saved on this device (built-in default in use)" };
  }
  if (key === "idea-lab") {
    const parts = Object.entries(IDEA_KEYS).map(([k, storeKey]) => [k, json(store, storeKey)] as const);
    if (parts.some(([, v]) => v === undefined)) return null;
    const counts = parts.map(([k, v]) => `${k} ${sizeOf(v)}`);
    return { count: parts.reduce((n, [, v]) => n + sizeOf(v), 0), items: counts, detail: "counts of saved Idea Lab evidence, owner overrides and proposals on this device" };
  }
  if (key === "room-checks") {
    const raw = json(store, ROOM_CHECKS_KEY);
    if (raw === undefined) return null;
    const recs = raw && typeof raw === "object" ? Object.values(raw as Record<string, { status?: unknown; buildId?: unknown }>) : [];
    const by: Record<string, number> = {};
    for (const r of recs) { const st = s(r?.status, 20) || "unknown"; by[st] = (by[st] ?? 0) + 1; }
    return { count: recs.length, items: Object.entries(by).map(([k, v]) => `${k} ${v}`), detail: "room-check results recorded on this device (any build)" };
  }
  return null;
}

export function collectDeviceSnapshot(route: string, store: Store | undefined = typeof localStorage === "undefined" ? undefined : localStorage, now = new Date()): DeviceSnapshot | null {
  const keys = DEVICE_SOURCE_KEYS[route];
  if (!keys || !store) return null;
  const sources: Record<string, DeviceSourceSummary> = {};
  for (const k of keys) { const r = collectOne(k, store); if (r) sources[k] = r; }
  return { route, collectedAt: now.toISOString(), sources };
}

/** Server-side validation of an untrusted device report. */
export function sanitizeDeviceSnapshot(raw: unknown): DeviceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const route = s(r["route"], 60);
  const collectedAt = s(r["collectedAt"], 40);
  if (!/^\/[a-z0-9-]{1,40}$/.test(route) || Number.isNaN(Date.parse(collectedAt))) return null;
  const allowed = DEVICE_SOURCE_KEYS[route] ?? [];
  const src = r["sources"] && typeof r["sources"] === "object" ? (r["sources"] as Record<string, unknown>) : {};
  const sources: Record<string, DeviceSourceSummary> = {};
  for (const k of allowed) {
    const v = src[k] as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") continue;
    const count = typeof v["count"] === "number" && Number.isFinite(v["count"]) ? Math.max(0, Math.min(100000, Math.floor(v["count"]))) : 0;
    sources[k] = { count, items: Array.isArray(v["items"]) ? v["items"].slice(0, 12).map((x) => s(x)).filter(Boolean) : [], detail: s(v["detail"], 160) };
  }
  return { route, collectedAt, sources };
}

/** Is this report usable for this room right now? */
export function deviceReportFor(snap: DeviceSnapshot | null | undefined, route: string, key: string, now = new Date()): { ok: true; summary: DeviceSourceSummary; at: string } | { ok: false; why: string } {
  if (!snap) return { ok: false, why: "device-unavailable: this device did not send its saved state with this request" };
  if (snap.route !== route) return { ok: false, why: "device-unavailable: the device report was for a different room" };
  const age = now.getTime() - Date.parse(snap.collectedAt);
  if (age > DEVICE_SNAPSHOT_MAX_AGE_MS || age < -60_000) return { ok: false, why: "device-unavailable: the device report is stale" };
  const summary = snap.sources[key];
  return summary ? { ok: true, summary, at: snap.collectedAt } : { ok: false, why: "device-unavailable: this saved state could not be read on the device" };
}
