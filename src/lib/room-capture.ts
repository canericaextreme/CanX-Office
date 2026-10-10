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

/** Matching desktop and phone sizes, so any two rooms are compared fairly. */
export const CAPTURE_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
export type CaptureViewportName = keyof typeof CAPTURE_VIEWPORTS;

/** `synopsis_open` = a Synopsis bubble held open next to its button. */
export const CAPTURE_STATES = ["default", "synopsis_open"] as const;
export type CaptureState = (typeof CAPTURE_STATES)[number];

/** A picture older than this is "stale" and must not be described as current. */
export const CAPTURE_MAX_AGE_MS = 10 * 60 * 1000;

/** Hides form fields and anything marked no-capture before the picture is taken. */
export const CAPTURE_MASK_CSS =
  "input,textarea,select,[contenteditable],[data-canx-no-capture]{visibility:hidden !important}";

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

export interface RoomCaptureMeta {
  room: string;
  route: string;
  /** ISO-8601 time the picture was taken. */
  capturedAt: string;
  viewport: { name: CaptureViewportName; width: number; height: number };
  /** Same value the Office health panel uses: the loaded entry script name. */
  buildVersion: string;
  state: CaptureState;
  /** Height of the full scrolled page in CSS pixels. */
  pageHeight: number;
  /** SHA-256 of the image bytes, so a retrieved file can be checked. */
  imageSha256: string;
}

export type CaptureMetaCheck =
  | { ok: true; meta: RoomCaptureMeta }
  | { ok: false; reason: string };

const SHA256 = /^[a-f0-9]{64}$/;

/** Strict check of the sidecar record that must travel with every picture. */
export function validateCaptureMeta(value: unknown): CaptureMetaCheck {
  if (!value || typeof value !== "object") return { ok: false, reason: "Capture record is missing." };
  const v = value as Record<string, unknown>;
  const route = v["route"];
  if (captureTier(route) === null || typeof route !== "string") return { ok: false, reason: "That is not an Office room." };
  const label = roomLabelFor(route);
  if (v["room"] !== label) return { ok: false, reason: "Room name does not match its route." };

  const at = typeof v["capturedAt"] === "string" ? Date.parse(v["capturedAt"]) : NaN;
  if (!Number.isFinite(at)) return { ok: false, reason: "Capture time is missing or invalid." };

  const vp = v["viewport"] as Record<string, unknown> | undefined;
  const name = vp?.["name"];
  if (typeof name !== "string" || !(name in CAPTURE_VIEWPORTS))
    return { ok: false, reason: "Viewport name is not recognised." };
  const expected = CAPTURE_VIEWPORTS[name as CaptureViewportName];
  if (vp?.["width"] !== expected.width || vp?.["height"] !== expected.height)
    return { ok: false, reason: "Viewport size does not match its name." };

  const build = v["buildVersion"];
  if (typeof build !== "string" || !build || build.length > 200)
    return { ok: false, reason: "Build version is missing." };

  const state = v["state"];
  if (!CAPTURE_STATES.includes(state as CaptureState)) return { ok: false, reason: "Capture state is not recognised." };

  const pageHeight = v["pageHeight"];
  if (typeof pageHeight !== "number" || !Number.isFinite(pageHeight) || pageHeight < 1 || pageHeight > 20000)
    return { ok: false, reason: "Page height is out of range." };

  const hash = v["imageSha256"];
  if (typeof hash !== "string" || !SHA256.test(hash)) return { ok: false, reason: "Image checksum is missing." };

  return {
    ok: true,
    meta: {
      room: label!,
      route,
      capturedAt: new Date(at).toISOString(),
      viewport: { name: name as CaptureViewportName, width: expected.width, height: expected.height },
      buildVersion: build,
      state: state as CaptureState,
      pageHeight,
      imageSha256: hash,
    },
  };
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
