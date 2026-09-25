/**
 * Astra's crash/reload buffer on THIS device, scoped to the server-verified
 * owner id. It holds the visible conversation, the unsent draft and a
 * persistence-only outbox of completed turns.
 *
 * Rules that must not be relaxed:
 *  - Never stores tokens, credentials, audio, provider payloads or office context.
 *  - The outbox only ever calls a checkpoint-append function. It never re-sends
 *    a request to Astra, never runs a room command, tool or approval.
 *  - Device-only text is labelled as such and is never called saved in CanX Brain.
 *  - Unanswered (interrupted) prompts are shown but never given to the model as
 *    history, so an old request cannot be acted on again.
 */

export const ASTRA_CACHE_PREFIX = "canx-astra-continuity:v1:";
export const MAX_CACHED_MESSAGES = 60;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_DRAFT_CHARS = 4000;
export const MAX_PENDING = 40;
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type TurnMode = "text" | "voice";

export interface CachedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  mode: TurnMode;
}

export interface PendingTurn {
  turnId: string;
  seq: number;
  user: string;
  answer: string;
  at: string;
  mode: TurnMode;
}

export interface DeviceSnapshot {
  v: 1;
  ownerId: string;
  savedAt: string;
  messages: CachedMessage[];
  draft: string;
  pending: PendingTurn[];
  nextSeq: number;
}

export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

const OWNER_RE = /^[0-9a-f-]{36}$/i;
const ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const TURN_RE = /^[0-9a-f-]{36}$/i;

export const cacheKey = (ownerId: string) => `${ASTRA_CACHE_PREFIX}${ownerId}`;

export function emptySnapshot(ownerId: string, now = new Date()): DeviceSnapshot {
  return { v: 1, ownerId, savedAt: now.toISOString(), messages: [], draft: "", pending: [], nextSeq: 1 };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const iso = (value: unknown, fallback: string) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;

export function cleanMessage(raw: unknown, fallbackAt: string): CachedMessage | null {
  const m = raw as Partial<CachedMessage> | null;
  if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
  if (typeof m.id !== "string" || !ID_RE.test(m.id)) return null;
  const content = text(m.content, MAX_MESSAGE_CHARS);
  if (!content.trim()) return null;
  return { id: m.id, role: m.role, content, at: iso(m.at, fallbackAt), mode: m.mode === "voice" ? "voice" : "text" };
}

export function cleanTurn(raw: unknown): PendingTurn | null {
  const t = raw as Partial<PendingTurn> | null;
  if (!t || typeof t.turnId !== "string" || !TURN_RE.test(t.turnId)) return null;
  const user = text(t.user, MAX_MESSAGE_CHARS).trim();
  const answer = text(t.answer, MAX_MESSAGE_CHARS).trim();
  if (!user || !answer) return null;
  const seq = typeof t.seq === "number" && Number.isInteger(t.seq) && t.seq > 0 ? t.seq : 1;
  return { turnId: t.turnId, seq, user, answer, at: iso(t.at, new Date().toISOString()), mode: t.mode === "voice" ? "voice" : "text" };
}

/** Untrusted input (it came from storage). Anything malformed is dropped. */
export function sanitizeSnapshot(raw: unknown, ownerId: string, now = new Date()): DeviceSnapshot | null {
  const s = raw as Partial<DeviceSnapshot> | null;
  if (!s || s.v !== 1 || s.ownerId !== ownerId) return null;
  const savedAt = iso(s.savedAt, "");
  if (!savedAt || now.getTime() - Date.parse(savedAt) > MAX_AGE_MS) return null;
  const messages = (Array.isArray(s.messages) ? s.messages : [])
    .map((m) => cleanMessage(m, savedAt)).filter((m): m is CachedMessage => !!m).slice(-MAX_CACHED_MESSAGES);
  const pending = (Array.isArray(s.pending) ? s.pending : [])
    .map(cleanTurn).filter((t): t is PendingTurn => !!t).slice(-MAX_PENDING);
  const nextSeq = Math.max(
    typeof s.nextSeq === "number" && Number.isInteger(s.nextSeq) ? s.nextSeq : 1,
    ...pending.map((t) => t.seq + 1), 1,
  );
  return { v: 1, ownerId, savedAt, messages, draft: text(s.draft, MAX_DRAFT_CHARS), pending, nextSeq };
}

export type LoadResult = { snapshot: DeviceSnapshot | null; message: string };

export function loadSnapshot(store: KeyStore | null, ownerId: string, now = new Date()): LoadResult {
  if (!OWNER_RE.test(ownerId)) return { snapshot: null, message: "The owner was not verified, so no device copy was opened." };
  if (!store) return { snapshot: null, message: "This device cannot keep a copy of the conversation (storage unavailable)." };
  let raw: string | null;
  try { raw = store.getItem(cacheKey(ownerId)); }
  catch { return { snapshot: null, message: "This device's conversation copy could not be read." }; }
  if (!raw) return { snapshot: null, message: "" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const snapshot = sanitizeSnapshot(parsed, ownerId, now);
  if (!snapshot) {
    try { store.removeItem(cacheKey(ownerId)); } catch { /* best effort */ }
    return { snapshot: null, message: "An old or damaged device copy was discarded." };
  }
  return {
    snapshot,
    message: snapshot.messages.length
      ? `Restored ${snapshot.messages.length} conversation lines from this device (saved ${new Date(snapshot.savedAt).toLocaleString()}).`
      : "",
  };
}

export function saveSnapshot(store: KeyStore | null, snapshot: DeviceSnapshot): boolean {
  if (!store || !OWNER_RE.test(snapshot.ownerId)) return false;
  try { store.setItem(cacheKey(snapshot.ownerId), JSON.stringify(snapshot)); return true; }
  catch { return false; }
}

function keysOf(store: KeyStore): string[] {
  const keys: string[] = [];
  const length = typeof store.length === "number" ? store.length : 0;
  for (let i = 0; i < length; i++) {
    const k = store.key?.(i);
    if (k) keys.push(k);
  }
  return keys;
}

/** Sign-out: remove every owner's Astra device copy. */
export function clearAllSnapshots(store: KeyStore | null) {
  if (!store) return;
  try { keysOf(store).filter((k) => k.startsWith(ASTRA_CACHE_PREFIX)).forEach((k) => store.removeItem(k)); }
  catch { /* best effort */ }
}

/** Owner switch: keep only the current owner's copy. */
export function clearOtherOwners(store: KeyStore | null, ownerId: string) {
  if (!store) return;
  try {
    keysOf(store).filter((k) => k.startsWith(ASTRA_CACHE_PREFIX) && k !== cacheKey(ownerId)).forEach((k) => store.removeItem(k));
  } catch { /* best effort */ }
}

export function withMessages(snapshot: DeviceSnapshot, messages: CachedMessage[], draft: string, now = new Date()): DeviceSnapshot {
  return {
    ...snapshot,
    savedAt: now.toISOString(),
    messages: messages.slice(-MAX_CACHED_MESSAGES).map((m) => ({ ...m, content: m.content.slice(0, MAX_MESSAGE_CHARS) })),
    draft: draft.slice(0, MAX_DRAFT_CHARS),
  };
}

/** Queue one completed turn. The same turn id is never queued twice. */
export function enqueueTurn(snapshot: DeviceSnapshot, turn: Omit<PendingTurn, "seq">): DeviceSnapshot {
  const clean = cleanTurn({ ...turn, seq: snapshot.nextSeq });
  if (!clean || snapshot.pending.some((t) => t.turnId === clean.turnId)) return snapshot;
  return { ...snapshot, pending: [...snapshot.pending, clean].slice(-MAX_PENDING), nextSeq: snapshot.nextSeq + 1 };
}

export function markSynced(snapshot: DeviceSnapshot, turnIds: Iterable<string>): DeviceSnapshot {
  const done = new Set(turnIds);
  return done.size ? { ...snapshot, pending: snapshot.pending.filter((t) => !done.has(t.turnId)) } : snapshot;
}

export type AppendOutcome = { ok: boolean; state: "saved" | "duplicate" | "unavailable" | "denied" | "failed"; message: string };

/**
 * Sends pending checkpoints oldest first, one at a time. The only side effect
 * is `append` (idempotent by turn id on the server). Stops at the first
 * failure so order is kept and nothing is retried in a tight loop.
 */
export async function flushPending(
  pending: readonly PendingTurn[],
  append: (turn: PendingTurn) => Promise<AppendOutcome>,
): Promise<{ synced: string[]; stopped: AppendOutcome | null }> {
  const synced: string[] = [];
  for (const turn of [...pending].sort((a, b) => a.seq - b.seq)) {
    let result: AppendOutcome;
    try { result = await append(turn); }
    catch { result = { ok: false, state: "failed", message: "No connection to the CanX account. Kept on this device; it will retry." }; }
    if (!result.ok) return { synced, stopped: result };
    synced.push(turn.turnId);
  }
  return { synced, stopped: null };
}

/** Ids of messages that belong to an answered user → Astra pair. */
export function completedPairIds(messages: readonly { id: string; role: string }[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < messages.length - 1; i++) {
    const a = messages[i]!, b = messages[i + 1]!;
    if (a.role === "user" && b.role === "assistant") { ids.add(a.id); ids.add(b.id); i++; }
  }
  return ids;
}

/**
 * History the model may see: only answered user → Astra pairs. An interrupted
 * or unanswered prompt is never handed back as history, so it cannot be
 * re-executed after a reload or reconnect.
 */
export function modelThread<T extends { id: string; role: string; content: string }>(messages: readonly T[]) {
  const ids = completedPairIds(messages);
  return messages
    .filter((m) => ids.has(m.id))
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/** Union by id, ordered by time; restored account turns fill gaps only. */
export function mergeMessages<T extends { id: string; at?: string | undefined }>(local: readonly T[], remote: readonly T[]): T[] {
  const seen = new Set(local.map((m) => m.id));
  const extra = remote.filter((m) => !seen.has(m.id));
  if (!extra.length) return [...local];
  const all = [...local, ...extra];
  return all
    .map((m, index) => ({ m, index }))
    .sort((a, b) => (Date.parse(a.m.at ?? "") || 0) - (Date.parse(b.m.at ?? "") || 0) || a.index - b.index)
    .map((x) => x.m)
    .slice(-MAX_CACHED_MESSAGES);
}

export function turnMessages(turn: { turnId: string; user: string; answer: string; at: string; mode: TurnMode }): CachedMessage[] {
  const t = Date.parse(turn.at) || Date.now();
  return [
    { id: `${turn.turnId}-u`, role: "user", content: turn.user, at: new Date(t).toISOString(), mode: turn.mode },
    { id: `${turn.turnId}-a`, role: "assistant", content: turn.answer, at: new Date(t + 1).toISOString(), mode: turn.mode },
  ];
}

export function browserStore(): KeyStore | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
