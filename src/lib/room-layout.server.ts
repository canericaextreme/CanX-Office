import {
  LAYOUT_HISTORY_NOTE_ID,
  LAYOUT_MAX_CHARS,
  LAYOUT_NOTE_ID,
  LAYOUT_SOURCE,
  addHistory,
  applyChange,
  cleanName,
  cleanOverride,
  homeRoomIdOf,
  isBoxId,
  parseHistory,
  parseLayout,
  serializeHistory,
  serializeLayout,
  snapshot,
  type BoxOverride,
  type LayoutHistory,
  type RoomLayout,
} from "./room-layout";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";

type Rest = (
  path: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; body: unknown }>;
type Row = Record<string, unknown>;

export const LAYOUT_ROUTES = OFFICE_ROOM_IDENTITIES.map((r) => r.route);

/** Route of the room a box was built in, from its id prefix. */
export function homeRouteOf(boxId: string): string | null {
  const id = homeRoomIdOf(boxId);
  return OFFICE_ROOM_IDENTITIES.find((r) => r.id === id)?.route ?? null;
}

async function readNote(
  rest: Rest,
  id: string,
): Promise<{ found: boolean; detail: string } | null> {
  const r = await rest(
    `office_notes?select=id,detail,source&id=eq.${encodeURIComponent(id)}&limit=1`,
  ).catch(() => null);
  if (!r?.ok || !Array.isArray(r.body)) return null;
  const row = r.body[0] as Row | undefined;
  if (!row) return { found: false, detail: "" };
  if (row["source"] !== LAYOUT_SOURCE) return null;
  return { found: true, detail: typeof row["detail"] === "string" ? row["detail"] : "" };
}

export interface LayoutRead {
  layout: RoomLayout;
  history: LayoutHistory;
  /** Raw saved text, used as the "nobody else changed it" check on the next save. */
  version: string;
}

export async function readRoomLayout(rest: Rest): Promise<LayoutRead | null> {
  const [l, h] = await Promise.all([
    readNote(rest, LAYOUT_NOTE_ID),
    readNote(rest, LAYOUT_HISTORY_NOTE_ID),
  ]);
  if (!l || !h) return null;
  return {
    layout: parseLayout(l.detail, LAYOUT_ROUTES),
    history: parseHistory(h.detail),
    version: l.detail,
  };
}

async function writeNote(
  rest: Rest,
  ownerId: string,
  id: string,
  title: string,
  detail: string,
  previous: { found: boolean; detail: string },
  checkPrevious: boolean,
): Promise<boolean> {
  const filter = `id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}&source=eq.${encodeURIComponent(LAYOUT_SOURCE)}`;
  const row = {
    id,
    owner_id: ownerId,
    kind: "decision",
    title,
    detail,
    owner_name: "John",
    provenance: "john",
    source: LAYOUT_SOURCE,
  };
  const saved = previous.found
    ? await rest(
        `office_notes?${filter}${checkPrevious ? `&detail=eq.${encodeURIComponent(previous.detail)}` : ""}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ detail }),
        },
      ).catch(() => null)
    : await rest("office_notes", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{ ...row, created_at: new Date().toISOString() }]),
      }).catch(() => null);
  if (!saved?.ok || !Array.isArray(saved.body) || saved.body.length !== 1) return false;
  const back = await readNote(rest, id);
  return back?.found === true && back.detail === detail;
}

export type SaveLayoutInput = {
  ownerId: string;
  /** Plain words for the history list. */
  what: string;
  /** New overrides per box; null puts that box back as built. */
  after: Record<string, unknown>;
  /** The layout text the editor was looking at. A mismatch means it changed elsewhere. */
  expectedVersion: string;
};

export type SaveLayoutResult =
  | { ok: true; message: string; read: LayoutRead }
  | { ok: false; message: string; read: LayoutRead | null };

/** Validate, save, read back. Never deletes a note; a reset only clears that box's override. */
export async function saveRoomLayoutWith(
  rest: Rest,
  input: SaveLayoutInput,
): Promise<SaveLayoutResult> {
  const ids = Object.keys(input.after ?? {});
  if (!ids.length || ids.length > 60)
    return { ok: false, message: "Nothing to change.", read: null };
  const homes: Record<string, string> = {};
  const after: Record<string, BoxOverride | null> = {};
  for (const id of ids) {
    const home = isBoxId(id) ? homeRouteOf(id) : null;
    if (!home)
      return { ok: false, message: "That box isn't recognised. Nothing was changed.", read: null };
    homes[id] = home;
    const raw = input.after[id];
    after[id] = raw === null ? null : cleanOverride(raw, LAYOUT_ROUTES);
    if (
      raw !== null &&
      raw &&
      typeof raw === "object" &&
      "r" in raw &&
      after[id]?.r !== (raw as BoxOverride).r
    )
      return { ok: false, message: "That room isn't recognised. Nothing was changed.", read: null };
    if (
      raw !== null &&
      raw &&
      typeof raw === "object" &&
      "n" in raw &&
      (raw as BoxOverride).n &&
      !cleanName((raw as BoxOverride).n)
    )
      return { ok: false, message: "That name can't be used. Nothing was changed.", read: null };
  }
  const [l, h] = await Promise.all([
    readNote(rest, LAYOUT_NOTE_ID),
    readNote(rest, LAYOUT_HISTORY_NOTE_ID),
  ]);
  if (!l || !h)
    return {
      ok: false,
      message: "The saved layout could not be read, so nothing was changed.",
      read: null,
    };
  const current = parseLayout(l.detail, LAYOUT_ROUTES);
  const fresh = (): LayoutRead => ({
    layout: current,
    history: parseHistory(h.detail),
    version: l.detail,
  });
  if (l.detail !== input.expectedVersion)
    return {
      ok: false,
      message: "The layout was changed somewhere else. It has been refreshed; try again.",
      read: fresh(),
    };
  const next = applyChange(current, after, homes);
  const detail = serializeLayout(next);
  if (detail.length > LAYOUT_MAX_CHARS)
    return {
      ok: false,
      message: "The layout list is full. Put some boxes back first.",
      read: fresh(),
    };
  const entry = {
    at: new Date().toISOString(),
    what: (cleanName(input.what) ?? "Changed the layout").slice(0, 160),
    before: snapshot(current, ids),
    after: snapshot(next, ids),
  };
  const history = addHistory(parseHistory(h.detail), entry);
  // History first: if the layout save then fails, the list only shows an extra line, never a lost change.
  const historySaved = await writeNote(
    rest,
    input.ownerId,
    LAYOUT_HISTORY_NOTE_ID,
    "Office room layout: change history",
    serializeHistory(history),
    h,
    false,
  );
  if (!historySaved)
    return {
      ok: false,
      message: "The change list could not be saved, so the layout was not changed.",
      read: fresh(),
    };
  const saved = await writeNote(
    rest,
    input.ownerId,
    LAYOUT_NOTE_ID,
    "Office room layout",
    detail,
    l,
    true,
  );
  const read = await readRoomLayout(rest);
  if (!saved || !read || read.version !== detail)
    return {
      ok: false,
      message: "The layout could not be confirmed on re-read. Refresh to check it.",
      read,
    };
  return { ok: true, message: "Saved and checked.", read };
}
