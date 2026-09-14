/**
 * Office Manager console — the four views and the honest room review state.
 *
 * Pure helpers only: no provider call, no storage, no side effects. Room
 * review state is derived from evidence the Manager actually has in this
 * browser session, never from a route name or an old picture.
 */

import { ROOMS, type RoomDef, type RoomId } from "@/lib/office-data";

export type ConsoleView = "now" | "rooms" | "team" | "settings";

export const CONSOLE_VIEWS: { id: ConsoleView; label: string }[] = [
  { id: "now", label: "Now" },
  { id: "rooms", label: "Rooms" },
  { id: "team", label: "Team" },
  { id: "settings", label: "Settings" },
];

export type RoomReadState = "verified" | "prepared" | "unknown" | "not-connected";

export const ROOM_STATE_LABELS: Record<RoomReadState, string> = {
  verified: "Verified",
  prepared: "Prepared",
  unknown: "Unknown",
  "not-connected": "Not connected",
};

/** One room review held in memory for this page session only. Never stored. */
export interface RoomReview {
  roomId: RoomId;
  /** Exact time the room was looked at. */
  at: string;
  /** The Manager's written present/needs/desired/verification answer. */
  text: string;
  /** Small picture kept only so John can compare present and desired. */
  thumbnail: string;
}

export interface RoomStatus {
  room: RoomDef;
  state: RoomReadState;
  /** Where the state came from — never inferred from the route name. */
  source: string;
  /** Exact time of the last visual review, when there is one. */
  lastReviewedAt: string | null;
}

/**
 * `recordsReadable` says only whether the server could read the shared office
 * records at all. It never upgrades a room to Verified on its own — a room is
 * Verified when it was actually looked at, or when its records were read.
 */
export function roomStatuses(options: {
  reviews: Record<string, RoomReview | undefined>;
  recordsReadable: boolean;
  /** Rooms whose content lives only on John's device. */
  deviceOnlyRooms?: RoomId[];
}): RoomStatus[] {
  const deviceOnly = new Set<RoomId>(options.deviceOnlyRooms ?? ["office-team", "idea-garage"]);
  return ROOMS.map((room) => {
    const review = options.reviews[room.id];
    if (review) {
      return {
        room,
        state: "verified" as const,
        source: `Looked at on this screen at ${review.at}.`,
        lastReviewedAt: review.at,
      };
    }
    if (deviceOnly.has(room.id)) {
      return {
        room,
        state: "not-connected" as const,
        source: "Records for this room are kept on this device only, so the Manager cannot read them from the server.",
        lastReviewedAt: null,
      };
    }
    if (options.recordsReadable) {
      return {
        room,
        state: "prepared" as const,
        source: "Shared office records were read, but this room has not been looked at in this session.",
        lastReviewedAt: null,
      };
    }
    return {
      room,
      state: "unknown" as const,
      source: "No records were read and this room has not been looked at, so there is no evidence either way.",
      lastReviewedAt: null,
    };
  });
}

/** Plain, unmistakable scope notice shown beside the observation control. */
export const OBSERVE_SCOPE_NOTICE = "Current CanX Office room only — not your whole phone or other tabs.";

const LOOK_REQUEST =
  /\b(look at (this|the) (screen|page|room)|what do you see|see this (room|screen|page)|review (this|the current) room|check this screen)\b/i;

/** A typed request that plainly asks the Manager to look at the current room. */
export function requestsRoomLook(message: string): boolean {
  return LOOK_REQUEST.test(message);
}

/**
 * The Manager may only look at the room that is open. Reviewing another room
 * means opening it first, and saying so.
 */
export function otherRoomNotice(target: string): string {
  return `I can only look at the room that is open. Open ${target} and press "See this room" and I will review it there.`;
}
