/**
 * Pure part of the room capture contract: sizes, states, the fixed room list and the record check.
 * No imports, so the Deno edge function can use it. `room-capture.test.ts` proves the room list
 * here equals the Office's own room identities, so the two cannot drift.
 */

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

export const CAPTURE_ROOM_LABELS: Readonly<Record<string, string>> = {
  "/reception": "Reception",
  "/owner-desk": "Owner's Desk",
  "/approvals": "Approvals",
  "/idea-garage": "Idea Garage",
  "/office-team": "Office Team",
  "/records": "Records",
  "/blueprint": "Blueprint",
  "/systems": "Systems",
  "/health": "Office Health",
  "/communications": "Communications & Marketing",
  "/legal": "Legal",
  "/subscriptions": "Subscriptions",
  "/finance": "Finance",
  "/work-board": "Work Board",
  "/build-testing": "Build & Testing",
  "/safe-highways": "Safe Highways",
  "/research": "Research",
  "/family-continuity": "Family Continuity, Skills & Training",
  "/future": "Future",
  "/brain": "Goal & Analytics / CanX Brain",
  "/projects": "Project Rooms",
  "/skills": "Skills / SOP Library",
  "/round-table": "Round Table",
  "/analytics": "Analytics"
};

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
  if (typeof route !== "string" || !(route in CAPTURE_ROOM_LABELS)) return { ok: false, reason: "That is not an Office room." };
  const label = CAPTURE_ROOM_LABELS[route];
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

