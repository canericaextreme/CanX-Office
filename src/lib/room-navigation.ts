/**
 * Elsie's room-navigation command — CLIENT-SAFE, PURE.
 *
 * "Open the Safe Highways room on the desk" moves this Office screen to a
 * named room and nothing else: no room read, no picture, no paid review and
 * no record change. That stays the job of the separate "look" command.
 * Destinations come only from the Office's own room list, so a website,
 * another browser tab or a made-up path can never be opened.
 */
import {
  MAP_ROOM_IDENTITIES,
  OFFICE_ROOM_IDENTITIES,
  cleanRoute,
  namedRoomIdentity,
  type OfficeRoomIdentity,
} from "./office-room-identity";

export type RoomNavigationCommand =
  | { kind: "navigate"; room: OfficeRoomIdentity }
  | { kind: "navigate-refused"; reason: "external" | "unknown"; message: string };

// "On the desk" (or screen/display) asks to change the display, not to inspect.
const DISPLAY_TARGET =
  /\s+(?:up\s+)?(?:on|onto|to)\s+(?:the|my|this|your)\s+(?:desk|screen|display|monitor|office screen|desk screen)\b/i;
// Verbs that only ever mean "move the screen", with or without a display target.
const NAV_ONLY_VERB =
  /^(?:(?:can|could|will) you )?(?:navigate|take me|bring me|switch(?: over)?|jump|move the (?:desk|screen|display))(?: over)? (?:to|into)\b/i;
const OPEN_VERB =
  /^(?:(?:can|could|will) you )?(?:open(?: up)?|go(?: to| into)?|show|pull up|put up|bring up|display)\b/i;
// A web address is refused whenever it is asked to be opened.
const WEB_ADDRESS =
  /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|ca|org|net|io|app|dev|ai|gov|edu|co|uk)\b/i;
const OPEN_ADDRESS_VERB =
  /^(?:(?:can|could|will) you )?(?:open(?: up)?|go to|visit|load|navigate to|take me to|pull up|bring up)\b/i;
// Anything that names a place outside the Office.
const EXTERNAL =
  /\b(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|ca|org|net|io|app|dev|ai|gov|edu|co|uk)\b|web ?sites?|web ?pages?|url|links?|browser|(?:new |other |another )?tabs?|google|youtube|facebook|gmail|chrome|safari)\b/i;
// Inspection words: these stay with the read-only "look" command.
const INSPECT =
  /\b(?:look|see|check|inspect|review|tell me|what(?:'s| is| do)|how many|count|colou?rs?|broken|wrong|and let'?s|work on)\b/i;

/** True only for an Office room route from the Office's own room list. */
export function isOfficeRoomRoute(route: string): boolean {
  if (!/^\/[a-z0-9-]+$/.test(route)) return false;
  const clean = cleanRoute(route);
  return OFFICE_ROOM_IDENTITIES.some((room) => room.route === clean);
}

export function roomNavigationRefusal(reason: "external" | "unknown", asked = ""): string {
  if (reason === "external")
    return "I can only open CanX Office rooms on this desk. I won't open websites, links or other browser tabs. Nothing was opened.";
  const names = MAP_ROOM_IDENTITIES.map((room) => room.shortLabel).join(", ");
  return `I couldn't find a CanX Office room called "${asked}". Nothing was opened. Rooms I can open: ${names}.`;
}

/**
 * Direct navigation requests only. Returns null when the request is not a
 * navigation request, so inspection and the normal Elsie answer still run.
 */
export function parseRoomNavigation(request: string): RoomNavigationCommand | null {
  const text = request
    .trim()
    .replace(/^(?:(?:elsie|astra|data)[, ]+)?(?:please\s+)?/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  const navOnly = NAV_ONLY_VERB.test(text);
  const display = DISPLAY_TARGET.test(text);
  const open = OPEN_VERB.test(text);
  if (OPEN_ADDRESS_VERB.test(text) && WEB_ADDRESS.test(text))
    return {
      kind: "navigate-refused",
      reason: "external",
      message: roomNavigationRefusal("external"),
    };
  if (!navOnly && !(display && open)) return null;
  const target = text
    .replace(DISPLAY_TARGET, " ")
    .replace(NAV_ONLY_VERB, "")
    .replace(OPEN_VERB, "")
    .replace(/\b(?:please|for me|now|right now)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (EXTERNAL.test(target)) {
    return {
      kind: "navigate-refused",
      reason: "external",
      message: roomNavigationRefusal("external"),
    };
  }
  // A look/count question is inspection, even when it names the desk.
  if (INSPECT.test(target)) return null;
  const room =
    namedRoomIdentity(target) ??
    (isOfficeRoomRoute(target)
      ? (OFFICE_ROOM_IDENTITIES.find((r) => r.route === cleanRoute(target)) ?? null)
      : null);
  if (room && isOfficeRoomRoute(room.route)) return { kind: "navigate", room };
  const asked = target
    .replace(/^(?:the|my)\s+/i, "")
    .replace(/\s+(?:room|page)$/i, "")
    .trim();
  // Only refuse when a room or the desk was clearly meant ("switch to Spanish" is not navigation).
  if (!asked || !(display || /\b(?:room|page)\b/i.test(target))) return null;
  return {
    kind: "navigate-refused",
    reason: "unknown",
    message: roomNavigationRefusal("unknown", asked),
  };
}

/** What Elsie says after the screen really moved, or why it did not. */
export function roomNavigationResult(
  room: OfficeRoomIdentity,
  landedPath: string | null,
): { ok: boolean; message: string } {
  if (landedPath !== null && cleanRoute(landedPath) === room.route)
    return {
      ok: true,
      message: `Opened ${room.shortLabel} on this screen (${room.route}). I only moved the screen; nothing was read or changed.`,
    };
  return {
    ok: false,
    message: `I couldn't open ${room.shortLabel} on this screen. Navigation isn't available right now, so nothing was opened or changed. You can open it from the office map.`,
  };
}
