/**
 * Live Brain view layout — CLIENT-SAFE, PURE.
 *
 * Where each Office room sits in the live Brain view. The 19 numbered rooms
 * keep their places from the office map (OFFICE_MAP_ROOMS x/y), so the view
 * looks like the Office from above. The Brain is the hub in the middle, and
 * the other pages (Projects, Skills, Round Table, Analytics) sit on a small
 * ring around it. Coordinates are in -1..1 (y up).
 */
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { OFFICE_MAP_ROOMS } from "./office-map";

export interface BrainViewRoom {
  route: string;
  label: string;
  x: number;
  y: number;
  hub: boolean;
}

export const BRAIN_HUB_ROUTE = "/brain";
const INNER_RING = 0.3;

export function brainViewRooms(): BrainViewRoom[] {
  const map = new Map(OFFICE_MAP_ROOMS.map((r) => [r.route, r]));
  const inner = OFFICE_ROOM_IDENTITIES.filter(
    (r) => !map.has(r.route) && r.route !== BRAIN_HUB_ROUTE,
  );
  return OFFICE_ROOM_IDENTITIES.map((r) => {
    const m = map.get(r.route);
    if (m)
      return {
        route: r.route,
        label: r.shortLabel,
        x: (m.x - 50) / 50,
        y: -(m.y - 50) / 50,
        hub: false,
      };
    if (r.route === BRAIN_HUB_ROUTE)
      return { route: r.route, label: "Brain", x: 0, y: 0, hub: true };
    const i = inner.findIndex((x) => x.route === r.route);
    const a = Math.PI / 2 + (i / inner.length) * Math.PI * 2;
    return {
      route: r.route,
      label: r.shortLabel,
      x: Math.cos(a) * INNER_RING,
      y: Math.sin(a) * INNER_RING,
      hub: false,
    };
  });
}

export const BRAIN_VIEW_ROUTES: string[] = brainViewRooms().map((r) => r.route);

const LABELS = new Map(brainViewRooms().map((r) => [r.route, r.label]));
/** Short room name for a route ("/build-testing" → "Build"). */
export const brainRoomLabel = (route: string): string => LABELS.get(route) ?? route;
