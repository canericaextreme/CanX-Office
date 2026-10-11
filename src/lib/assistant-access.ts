/**
 * Assistant view access — the policy, as pure and testable rules.
 *
 * This is the rulebook that the database functions and server code must
 * follow. It decides nothing by itself in production: it exists so every
 * refusal is written down once and tested. It takes no pictures and holds no
 * credentials.
 *
 * Principles (John, 10 Oct 2026):
 * - Each assistant has its own revocable grant. Revoking one never touches
 *   another.
 * - Viewing is a separate permission from modifying records, building or
 *   spending, and from deleting. A view grant can do none of those.
 * - Sessions are short-lived and issued per request. An assistant never holds
 *   John's password, his owner session or an administrative credential.
 * - Two-step (authenticator) rooms stay behind the owner's authenticator: they
 *   open only inside a window John approves, and the window expires.
 */

import { captureTier, type RoomTier } from "@/lib/room-capture";

export const ASSISTANTS = ["claude", "chatgpt", "elsie"] as const;
export type Assistant = (typeof ASSISTANTS)[number];

/** Existing permission: records, Brain, builds. Includes modifying and building. */
export const WORK_PERMISSION = "office-work-v1";
/** New, narrower permission: look at rooms and read their information. */
export const VIEW_PERMISSION = "office-view-v1";
export type OfficePermission = typeof WORK_PERMISSION | typeof VIEW_PERMISSION;

export const VIEW_SCOPES = ["view_room_images", "read_room_information"] as const;
/** Things a view grant can never do. */
export const NEVER_FOR_VIEW = ["modify_records", "start_builds_or_spend", "delete_records", "change_access"] as const;

export type ViewScope = (typeof VIEW_SCOPES)[number];

export function scopesForPermission(permission: string): readonly string[] {
  if (permission === VIEW_PERMISSION) return VIEW_SCOPES;
  return [];
}

/** A capture session this short is enough for one room; it cannot be extended. */
export const CAPTURE_SESSION_TTL_MS = 5 * 60 * 1000;
/** The window John opens with his authenticator for two-step rooms. */
export const TWO_STEP_WINDOW_MAX_MS = 15 * 60 * 1000;
export const MAX_CAPTURES_PER_HOUR = 30;

export interface AssistantGrant {
  assistant: Assistant;
  permission: string;
  enabled: boolean;
  /** ISO time John revoked it, if he did. */
  revokedAt?: string | null;
  /** ISO time the grant lapses on its own, if it was given an end date. */
  expiresAt?: string | null;
}

export type AccessDenial =
  | "no_grant"
  | "revoked"
  | "grant_expired"
  | "wrong_permission"
  | "unknown_room"
  | "two_step_window_required"
  | "session_expired"
  | "rate_limited";

export type AccessDecision = { allow: true; tier: RoomTier } | { allow: false; reason: AccessDenial };

export interface AccessRequest {
  grant: AssistantGrant | null;
  route: unknown;
  now: number;
  /** When the two-step window John opened ends (ms), if one is open. */
  twoStepWindowUntil?: number | null;
  /** When the short-lived session used for this request was issued (ms). */
  sessionIssuedAt?: number | null;
  /** Captures this assistant already made in the last hour. */
  capturesLastHour?: number;
}

/** First failing rule wins, so the reason an assistant sees is always the most basic one. */
export function decideRoomViewAccess(request: AccessRequest): AccessDecision {
  const { grant, now } = request;
  if (!grant) return { allow: false, reason: "no_grant" };
  if (!grant.enabled || grant.revokedAt) return { allow: false, reason: "revoked" };
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) return { allow: false, reason: "grant_expired" };
  if (grant.permission !== VIEW_PERMISSION) return { allow: false, reason: "wrong_permission" };

  const tier = captureTier(request.route);
  if (tier === null) return { allow: false, reason: "unknown_room" };

  const issued = request.sessionIssuedAt;
  if (typeof issued === "number" && (now - issued > CAPTURE_SESSION_TTL_MS || issued > now + 60_000)) {
    return { allow: false, reason: "session_expired" };
  }
  if ((request.capturesLastHour ?? 0) >= MAX_CAPTURES_PER_HOUR) return { allow: false, reason: "rate_limited" };

  if (tier === "two_step") {
    const until = request.twoStepWindowUntil;
    const open = typeof until === "number" && until > now && until - now <= TWO_STEP_WINDOW_MAX_MS;
    if (!open) return { allow: false, reason: "two_step_window_required" };
  }
  return { allow: true, tier };
}

/** What an assistant is told. Short, safe and the same wording every time. */
export const DENIAL_MESSAGES: Record<AccessDenial, string> = {
  no_grant: "This assistant has not been given access to view the Office.",
  revoked: "Access for this assistant was turned off by the owner.",
  grant_expired: "This assistant's access has expired. The owner can renew it.",
  wrong_permission: "This assistant's permission does not include viewing rooms.",
  unknown_room: "That is not an Office room.",
  two_step_window_required: "This room is protected by the owner's authenticator. It can be viewed only while the owner has opened a viewing window.",
  session_expired: "The short-lived viewing session has expired. Request the view again.",
  rate_limited: "Too many room views in the last hour. Try again later.",
};

/** One audit row per attempt, allowed or refused. It never holds images or credentials. */
export interface ViewAuditRow {
  action: "office_view.room";
  entity: "room";
  entity_id: string;
  detail: { assistant: Assistant; outcome: "allowed" | AccessDenial | "capture_failed"; tier: RoomTier | null; at: string };
}

export function viewAuditRow(input: {
  assistant: Assistant;
  route: unknown;
  outcome: ViewAuditRow["detail"]["outcome"];
  now: number;
}): ViewAuditRow {
  const tier = captureTier(input.route);
  return {
    action: "office_view.room",
    entity: "room",
    // Only a known route is ever written; anything else is recorded as unknown.
    entity_id: tier ? String(input.route) : "unknown",
    detail: { assistant: input.assistant, outcome: input.outcome, tier, at: new Date(input.now).toISOString() },
  };
}
