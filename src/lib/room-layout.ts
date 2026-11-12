/**
 * Room layout — CLIENT-SAFE, PURE.
 *
 * John, 12 Nov 2026: "place an edit tab in the top left of each of the 20 offices ... unlock, edit
 * and lock ... enable each of the office boxes, shelves and all parts to be moved, edited in name,
 * and move to other offices."
 *
 * A "box" is one card or shelf inside a room, marked in code with <RoomBox id="room.part">.
 * John's changes are saved as small overrides, never as edits to the box's contents:
 *   r = the room it now lives in (route), o = its place among its neighbours, n = its new name.
 * Nothing is ever deleted. Every change is also written to a history list so it can be put back.
 *
 * Storage: two owner-only Office notes (same table and security as the Brain shelf labels).
 *   office-room-layout         -> the current overrides
 *   office-room-layout-history -> the newest changes, newest first, for Undo / Put back
 */

export const LAYOUT_SOURCE = "Office room layout";
export const LAYOUT_NOTE_ID = "office-room-layout";
export const LAYOUT_HISTORY_NOTE_ID = "office-room-layout-history";
/** office_notes.detail holds at most 12,000 characters. Keep a margin. */
export const LAYOUT_MAX_CHARS = 11_000;
export const HISTORY_MAX_CHARS = 11_000;
export const NAME_MAX = 80;

/** One box's override. Missing keys mean "as built". */
export interface BoxOverride {
  /** Route of the room the box now lives in, e.g. "/finance". */
  r?: string;
  /** Order among the boxes that share its shelf (lower first). */
  o?: number;
  /** John's name for it. */
  n?: string;
}

export interface RoomLayout {
  v: 1;
  b: Record<string, BoxOverride>;
}

export interface LayoutChangeEntry {
  /** ISO time. */
  at: string;
  /** Plain words, e.g. 'Moved "Budget" to Finance'. */
  what: string;
  /** Overrides before the change, per box (null = as built). */
  before: Record<string, BoxOverride | null>;
  after: Record<string, BoxOverride | null>;
}

export interface LayoutHistory {
  v: 1;
  h: LayoutChangeEntry[];
}

export const EMPTY_LAYOUT: RoomLayout = { v: 1, b: {} };
export const EMPTY_HISTORY: LayoutHistory = { v: 1, h: [] };

/** Box ids look like "owner-desk.priorities": lower-case words, dots and dashes only. */
export function isBoxId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 90 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(id);
}

export function isRoomRoute(route: unknown, routes: readonly string[]): route is string {
  return typeof route === "string" && routes.includes(route);
}

export function cleanName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const t = name
    // eslint-disable-next-line no-control-regex -- strips control characters from names
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
  return t || undefined;
}

/** Drops anything malformed. Unknown room routes are kept out so a box never vanishes into nowhere. */
export function cleanOverride(raw: unknown, routes: readonly string[]): BoxOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const out: BoxOverride = {};
  if (isRoomRoute(v["r"], routes)) out.r = v["r"];
  if (typeof v["o"] === "number" && Number.isFinite(v["o"]))
    out.o = Math.max(-9999, Math.min(9999, Math.round(v["o"])));
  const n = cleanName(v["n"]);
  if (n) out.n = n;
  return Object.keys(out).length ? out : null;
}

export function parseLayout(detail: unknown, routes: readonly string[]): RoomLayout {
  if (typeof detail !== "string" || !detail) return { v: 1, b: {} };
  try {
    const raw = JSON.parse(detail) as { v?: unknown; b?: unknown };
    if (raw?.v !== 1 || !raw.b || typeof raw.b !== "object") return { v: 1, b: {} };
    const b: Record<string, BoxOverride> = {};
    for (const [id, o] of Object.entries(raw.b as Record<string, unknown>)) {
      const clean = isBoxId(id) ? cleanOverride(o, routes) : null;
      if (clean) b[id] = clean;
    }
    return { v: 1, b };
  } catch {
    return { v: 1, b: {} };
  }
}

export function parseHistory(detail: unknown): LayoutHistory {
  if (typeof detail !== "string" || !detail) return { v: 1, h: [] };
  try {
    const raw = JSON.parse(detail) as { v?: unknown; h?: unknown };
    if (raw?.v !== 1 || !Array.isArray(raw.h)) return { v: 1, h: [] };
    return {
      v: 1,
      h: raw.h
        .filter((e) => e && typeof e === "object" && typeof e.at === "string")
        .slice(0, 200) as LayoutChangeEntry[],
    };
  } catch {
    return { v: 1, h: [] };
  }
}

/** The room a box shows in: its saved room, else the room it was built in. */
export function roomOfBox(layout: RoomLayout, boxId: string, homeRoute: string): string {
  return layout.b[boxId]?.r ?? homeRoute;
}

/**
 * Apply one change (a set of box overrides; null resets that box to "as built").
 * Overrides equal to "as built" (moved back home, empty name) are removed so the note stays small.
 */
export function applyChange(
  layout: RoomLayout,
  after: Record<string, BoxOverride | null>,
  homes: Record<string, string>,
): RoomLayout {
  const b = { ...layout.b };
  for (const [id, o] of Object.entries(after)) {
    if (!o) {
      delete b[id];
      continue;
    }
    const next: BoxOverride = {};
    if (o.r && o.r !== homes[id]) next.r = o.r;
    if (typeof o.o === "number") next.o = o.o;
    if (o.n) next.n = o.n;
    if (Object.keys(next).length) b[id] = next;
    else delete b[id];
  }
  return { v: 1, b };
}

/** Before-values for the boxes a change touches, so it can be put back exactly. */
export function snapshot(layout: RoomLayout, ids: string[]): Record<string, BoxOverride | null> {
  const out: Record<string, BoxOverride | null> = {};
  for (const id of ids) out[id] = layout.b[id] ? { ...layout.b[id] } : null;
  return out;
}

/** Newest first; trims the oldest entries until the note fits. */
export function addHistory(history: LayoutHistory, entry: LayoutChangeEntry): LayoutHistory {
  const h = [entry, ...history.h];
  while (h.length > 1 && JSON.stringify({ v: 1, h }).length > HISTORY_MAX_CHARS) h.pop();
  return { v: 1, h };
}

export function serializeLayout(layout: RoomLayout): string {
  return JSON.stringify({ v: 1, b: layout.b });
}

export function serializeHistory(history: LayoutHistory): string {
  return JSON.stringify({ v: 1, h: history.h });
}

/** Renumber the boxes that share a shelf after one of them moves up or down. */
export function reorder(ids: string[], moving: string, step: -1 | 1): string[] | null {
  const i = ids.indexOf(moving);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Place a dragged box just before the target. */
export function placeBefore(ids: string[], moving: string, target: string): string[] | null {
  if (moving === target || !ids.includes(moving) || !ids.includes(target)) return null;
  const rest = ids.filter((id) => id !== moving);
  rest.splice(rest.indexOf(target), 0, moving);
  return rest;
}

/** Orders 10, 20, 30... for a shelf in the given sequence, keeping any other saved values. */
export function orderChange(
  layout: RoomLayout,
  sequence: string[],
): Record<string, BoxOverride | null> {
  const out: Record<string, BoxOverride | null> = {};
  sequence.forEach((id, index) => {
    out[id] = { ...(layout.b[id] ?? {}), o: (index + 1) * 10 };
  });
  return out;
}

/** Boxes that were moved INTO this room from elsewhere, in their saved order. */
export function boxesMovedInto(
  layout: RoomLayout,
  route: string,
  homes: Record<string, string>,
): string[] {
  return Object.entries(layout.b)
    .filter(([id, o]) => o.r === route && homes[id] && homes[id] !== route)
    .sort((a, b) => (a[1].o ?? 0) - (b[1].o ?? 0) || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** Room id ("owner-desk") from a box id ("owner-desk.priorities"). */
export function homeRoomIdOf(boxId: string): string {
  return boxId.split(".")[0] ?? "";
}

/** A stable id part from a built name: "Today's priorities" -> "today-s-priorities". */
export function boxSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "part"
  );
}
