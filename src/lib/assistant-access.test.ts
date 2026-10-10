import { describe, expect, it } from "vitest";
import {
  ASSISTANTS,
  CAPTURE_SESSION_TTL_MS,
  DENIAL_MESSAGES,
  MAX_CAPTURES_PER_HOUR,
  NEVER_FOR_VIEW,
  TWO_STEP_WINDOW_MAX_MS,
  VIEW_PERMISSION,
  VIEW_SCOPES,
  WORK_PERMISSION,
  decideRoomViewAccess,
  scopesForPermission,
  viewAuditRow,
  type AssistantGrant,
} from "@/lib/assistant-access";

const NOW = Date.parse("2026-10-10T17:00:00Z");
const grant = (over: Partial<AssistantGrant> = {}): AssistantGrant => ({ assistant: "claude", permission: VIEW_PERMISSION, enabled: true, ...over });

describe("view permission is separate from doing things", () => {
  it("grants only viewing scopes and never modify, spend, delete or access changes", () => {
    expect(scopesForPermission(VIEW_PERMISSION)).toEqual([...VIEW_SCOPES]);
    for (const never of NEVER_FOR_VIEW) expect(scopesForPermission(VIEW_PERMISSION)).not.toContain(never);
    expect(scopesForPermission(WORK_PERMISSION)).toEqual([]);
    expect(scopesForPermission("anything-else")).toEqual([]);
  });
  it("covers all three assistants", () => {
    expect([...ASSISTANTS].sort()).toEqual(["chatgpt", "claude", "elsie"]);
  });
});

describe("room view decisions", () => {
  it("allows a standard room with a live view grant", () => {
    expect(decideRoomViewAccess({ grant: grant(), route: "/brain", now: NOW })).toEqual({ allow: true, tier: "standard" });
  });

  it("refuses when there is no grant, it is revoked, disabled or expired", () => {
    const deny = (g: AssistantGrant | null) => decideRoomViewAccess({ grant: g, route: "/brain", now: NOW });
    expect(deny(null)).toEqual({ allow: false, reason: "no_grant" });
    expect(deny(grant({ enabled: false }))).toEqual({ allow: false, reason: "revoked" });
    expect(deny(grant({ revokedAt: "2026-10-10T16:00:00Z" }))).toEqual({ allow: false, reason: "revoked" });
    expect(deny(grant({ expiresAt: "2026-10-10T16:59:59Z" }))).toEqual({ allow: false, reason: "grant_expired" });
    expect(deny(grant({ expiresAt: "2026-10-10T17:00:01Z" })).allow).toBe(true);
  });

  it("does not let a work grant stand in for a view grant", () => {
    expect(decideRoomViewAccess({ grant: grant({ permission: WORK_PERMISSION }), route: "/brain", now: NOW })).toEqual({
      allow: false,
      reason: "wrong_permission",
    });
  });

  it("revoking one assistant does not affect another", () => {
    const claude = grant({ assistant: "claude", enabled: false });
    const chatgpt = grant({ assistant: "chatgpt" });
    expect(decideRoomViewAccess({ grant: claude, route: "/brain", now: NOW }).allow).toBe(false);
    expect(decideRoomViewAccess({ grant: chatgpt, route: "/brain", now: NOW }).allow).toBe(true);
  });

  it("refuses unknown rooms, including path tricks", () => {
    for (const route of ["/nope", "/brain/../finance", "https://evil.example/brain", "", undefined, 42, "/brain?x=1"]) {
      expect(decideRoomViewAccess({ grant: grant(), route, now: NOW })).toEqual({ allow: false, reason: "unknown_room" });
    }
  });

  it("keeps two-step rooms behind the owner's authenticator window", () => {
    const base = { grant: grant(), route: "/legal", now: NOW };
    expect(decideRoomViewAccess(base)).toEqual({ allow: false, reason: "two_step_window_required" });
    expect(decideRoomViewAccess({ ...base, twoStepWindowUntil: NOW - 1 })).toEqual({ allow: false, reason: "two_step_window_required" });
    expect(decideRoomViewAccess({ ...base, twoStepWindowUntil: NOW + 60_000 })).toEqual({ allow: true, tier: "two_step" });
    // A window longer than the maximum is not honoured.
    expect(decideRoomViewAccess({ ...base, twoStepWindowUntil: NOW + TWO_STEP_WINDOW_MAX_MS + 1 })).toEqual({
      allow: false,
      reason: "two_step_window_required",
    });
  });

  it("refuses an expired or future-dated short-lived session", () => {
    const base = { grant: grant(), route: "/brain", now: NOW };
    expect(decideRoomViewAccess({ ...base, sessionIssuedAt: NOW - CAPTURE_SESSION_TTL_MS }).allow).toBe(true);
    expect(decideRoomViewAccess({ ...base, sessionIssuedAt: NOW - CAPTURE_SESSION_TTL_MS - 1 })).toEqual({ allow: false, reason: "session_expired" });
    expect(decideRoomViewAccess({ ...base, sessionIssuedAt: NOW + 10 * 60_000 })).toEqual({ allow: false, reason: "session_expired" });
  });

  it("limits views per hour", () => {
    const base = { grant: grant(), route: "/brain", now: NOW };
    expect(decideRoomViewAccess({ ...base, capturesLastHour: MAX_CAPTURES_PER_HOUR - 1 }).allow).toBe(true);
    expect(decideRoomViewAccess({ ...base, capturesLastHour: MAX_CAPTURES_PER_HOUR })).toEqual({ allow: false, reason: "rate_limited" });
  });

  it("has a plain message for every refusal and none leaks detail", () => {
    for (const message of Object.values(DENIAL_MESSAGES)) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/token|password|secret|key|jwt/i);
    }
  });
});

describe("audit rows", () => {
  it("record who, which known room and the outcome, with no image or credential", () => {
    const row = viewAuditRow({ assistant: "chatgpt", route: "/brain", outcome: "allowed", now: NOW });
    expect(row).toEqual({
      action: "office_view.room",
      entity: "room",
      entity_id: "/brain",
      detail: { assistant: "chatgpt", outcome: "allowed", tier: "standard", at: "2026-10-10T17:00:00.000Z" },
    });
    expect(Object.keys(row.detail).sort()).toEqual(["assistant", "at", "outcome", "tier"]);
  });
  it("never writes an unknown route verbatim", () => {
    const row = viewAuditRow({ assistant: "claude", route: "/x?token=abc", outcome: "unknown_room", now: NOW });
    expect(row.entity_id).toBe("unknown");
    expect(JSON.stringify(row)).not.toContain("token");
  });
});
