/**
 * In-memory store of the snapshots John's room view last displayed, keyed by
 * route. Used to reconcile Elsie's fresh read with what John is looking at.
 * Session memory only; nothing is persisted.
 */
import type { SnapshotRef } from "./room-snapshot";

const viewed = new Map<string, SnapshotRef>();

export function recordViewedSnapshot(ref: SnapshotRef) { viewed.set(ref.route, ref); }
export function viewedSnapshot(route: string): SnapshotRef | null { return viewed.get(route) ?? null; }
export function clearViewedSnapshots() { viewed.clear(); }

/** Ask every visible room view to refresh (after writes, reconcile, etc.). */
export const ROOM_REFRESH_EVENT = "canx:room-snapshot-refresh";
export function requestRoomRefresh(reason: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ROOM_REFRESH_EVENT, { detail: { reason } }));
}
