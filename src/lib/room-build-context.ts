/**
 * Room context for Office build requests — PURE.
 *
 * 1 Nov 2026 (John: "make Elsie better at ... creating builds or fixes for the
 * room"): a spoken "fix this room's header" reached the builder as John's bare
 * words, so the builder had to guess which screen he meant. This adds one line
 * naming the room and the exact screen file the builder should open.
 *
 * Safety: the line never changes what the protected-word check decides. Room
 * names such as Finance or Legal would otherwise turn a plain screen request
 * into a refusal John never asked for, so the line is left out whenever adding
 * it would change the protected category of the request.
 */
import { officeBuildProtectedCategory } from "./codex-task-handoff";
import { roomTargetForRoute } from "./room-snapshot";

/** The page file that draws a room, e.g. "/work-board" → src/routes/_office/work-board.tsx. */
export function roomScreenFile(route: string | null | undefined): string | null {
  const target = roomTargetForRoute(route);
  return target ? `src/routes/_office${target.route}.tsx` : null;
}

/** "Requested Office room: Work Board (/work-board); screen file src/routes/_office/work-board.tsx." */
export function roomBuildLine(route: string | null | undefined): string | null {
  const target = roomTargetForRoute(route);
  const file = roomScreenFile(route);
  return target && file ? `Requested Office room: ${target.label} (${target.route}); screen file ${file}.` : null;
}

/**
 * John's request plus the room line, when it is safe and useful. The request
 * is returned unchanged when there is no room, when it already names the
 * screen file, when the result would exceed the saved-task limit, or when the
 * line would change the protected-word decision.
 */
export function withRoomContext(request: string, route: string | null | undefined, maxLength = 2000): string {
  const line = roomBuildLine(route);
  const file = roomScreenFile(route);
  if (!line || !file || request.includes(file)) return request;
  const scoped = `${request}\n${line}`;
  if (scoped.length > maxLength) return request;
  if (officeBuildProtectedCategory(scoped) !== officeBuildProtectedCategory(request)) return request;
  return scoped;
}
