/**
 * Room capture contract — what a real-browser picture of an Office room must
 * carry, and which rooms need what before they may be captured.
 *
 * This file is the rulebook only. It takes no pictures, stores nothing and
 * calls no service. The capture script (`scripts/capture/capture-room.mjs`)
 * and any future retrieval endpoint must follow it; tests keep the two copies
 * in step.
 *
 * Room list and protection come from the Office's own sources — the canonical
 * room identities and the per-room data sources in `room-snapshot.ts` — not a
 * second list kept here.
 */

import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";
import { ROOM_TARGETS } from "@/lib/room-snapshot";

export {
  CAPTURE_VIEWPORTS, CAPTURE_STATES, CAPTURE_MAX_AGE_MS, CAPTURE_MASK_CSS, CAPTURE_ROOM_LABELS, validateCaptureMeta,
  type CaptureViewportName, type CaptureState, type RoomCaptureMeta, type CaptureMetaCheck,
} from "@/lib/room-capture-meta";
import { CAPTURE_MAX_AGE_MS, type RoomCaptureMeta } from "@/lib/room-capture-meta";

export interface OfficeRoomEntry {
  route: string;
  label: string;
}

/** Every Office room page, in the Office's own canonical identity list. */
export function officeRoomCatalogue(): OfficeRoomEntry[] {
  return OFFICE_ROOM_IDENTITIES.map((room) => ({ route: room.route, label: room.label }));
}

export function roomLabelFor(route: string): string | undefined {
  return officeRoomCatalogue().find((room) => room.route === route)?.label;
}

export function allOfficeRoutes(): string[] {
  return officeRoomCatalogue().map((room) => room.route);
}

/**
 * Rooms whose saved data the Office itself protects with the owner's two-step
 * check (authenticator). Today: Communications, Legal, Subscriptions, Finance
 * and Projects. An assistant's capture of these needs a window John opens
 * with his authenticator; nothing here weakens that.
 */
export function twoStepRoutes(): string[] {
  return ROOM_TARGETS.filter((target) => target.sources.some((source) => source.needsTwoStep)).map((target) => target.route);
}

export type RoomTier = "standard" | "two_step";

export function captureTier(route: unknown): RoomTier | null {
  if (typeof route !== "string" || !allOfficeRoutes().includes(route)) return null;
  return twoStepRoutes().includes(route) ? "two_step" : "standard";
}

/**
 * May this room be captured right now? Standard rooms yes. Two-step rooms only
 * while the owner's authenticator-approved window is open.
 */
export function isCapturableRoute(route: unknown, opts: { twoStepWindowOpen?: boolean } = {}): route is string {
  const tier = captureTier(route);
  if (tier === "standard") return true;
  return tier === "two_step" && opts.twoStepWindowOpen === true;
}

export type CaptureFreshness = "fresh" | "stale" | "from-the-future";

/** An assistant must say "stale" rather than describe an old picture as now. */
export function captureFreshness(meta: Pick<RoomCaptureMeta, "capturedAt">, now: number = Date.now()): CaptureFreshness {
  const age = now - Date.parse(meta.capturedAt);
  if (age < -60_000) return "from-the-future";
  return age > CAPTURE_MAX_AGE_MS ? "stale" : "fresh";
}

/** True only when the picture was taken on the build that is live now. */
export function captureMatchesBuild(meta: Pick<RoomCaptureMeta, "buildVersion">, liveBuild: string): boolean {
  return meta.buildVersion !== "unknown" && meta.buildVersion === liveBuild;
}
