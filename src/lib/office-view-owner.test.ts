// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanGrantInput, describeGrant, protectedRoomsIn, type GrantRow } from "@/lib/office-view-owner";
import { CAPTURE_ROOM_LABELS } from "@/lib/room-capture-meta";
import { readFileSync } from "node:fs";

const ID = "00000000-0000-4000-8000-000000000011";
const good = { assistant: "claude", viewerUserId: ID, rooms: ["/brain", "/legal"], days: 30, scopes: ["view_room_images"] };

describe("grant input", () => {
  it("accepts a well-formed request and removes duplicates", () => {
    const r = cleanGrantInput({ ...good, rooms: ["/brain", "/brain"], scopes: ["view_room_images", "view_room_images"] });
    expect(r).toEqual({ ok: true, value: { assistant: "claude", viewerUserId: ID, rooms: ["/brain"], days: 30, scopes: ["view_room_images"] } });
  });
  it("refuses unknown assistants, bad ids, unknown rooms, empty lists, bad scopes and bad durations", () => {
    for (const bad of [{ assistant: "grok" }, { viewerUserId: "me" }, { rooms: [] }, { rooms: ["/nope"] }, { rooms: "all" }, { scopes: [] }, { scopes: ["delete_everything"] }, { scopes: ["write"] }, { days: 0 }, { days: 91 }, { days: 1.5 }, { days: "30" }])
      expect(cleanGrantInput({ ...good, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    expect(cleanGrantInput(null).ok).toBe(false);
  });
  it("cannot be used to ask for write, spend or build powers: only two view scopes exist", () => {
    const src = readFileSync("src/lib/office-view-owner.ts", "utf8");
    expect(src).toContain('["view_room_images", "read_room_information"]');
  });
  it("knows which chosen rooms are protected", () => {
    expect(protectedRoomsIn(["/brain", "/legal", "/finance"])).toEqual(["/legal", "/finance"]);
    expect(Object.keys(CAPTURE_ROOM_LABELS)).toEqual(expect.arrayContaining(["/legal", "/finance", "/subscriptions", "/communications", "/projects"]));
  });
});

describe("status words", () => {
  const now = Date.parse("2026-10-10T20:00:00Z");
  const row = (over: Partial<GrantRow> = {}): GrantRow => ({ assistant: "claude", enabled: true, rooms: ["/brain"], scopes: ["view_room_images"], expires_at: "2026-11-01T00:00:00Z", delegated_at: "2026-10-01T00:00:00Z", revoked_at: null, captures_last_day: 0, last_used_at: null, ...over });
  it("says plainly when nothing is authorised", () => expect(describeGrant(undefined, now).state).toBe("off"));
  it("says on only for a live, enabled, unexpired grant", () => {
    expect(describeGrant(row(), now).state).toBe("on");
    expect(describeGrant(row({ enabled: false }), now).state).toBe("off");
    expect(describeGrant(row({ expires_at: "2026-10-01T00:00:00Z" }), now).state).toBe("expired");
    expect(describeGrant(row({ revoked_at: "2026-10-09T00:00:00Z" }), now).state).toBe("revoked");
  });
});

describe("the owner functions and panel", () => {
  const fns = readFileSync("src/lib/office-view-owner.functions.ts", "utf8");
  it("needs the authenticator to grant and only a signed-in owner to revoke or read", () => {
    const grant = fns.slice(fns.indexOf("export const setViewAccess"), fns.indexOf("export const revokeViewAccess"));
    expect(grant).toContain("b.verifyOwner(");
    expect(grant).not.toContain("verifySignedIn");
    const revoke = fns.slice(fns.indexOf("export const revokeViewAccess"));
    expect(revoke).toContain("b.verifySignedIn(");
    expect(fns).not.toContain("canx-viewer.server"); // an assistant viewer can never reach these
  });
  it("is hidden from a viewing session and never offers the grant without the authenticator", () => {
    const panel = readFileSync("src/components/office/ViewAccessPanel.tsx", "utf8");
    expect(panel).toContain("if (session.viewer) return null;");
    expect(panel).toContain("if (!session.stepUpComplete)");
    expect(panel).toContain("setMfaOpen(true)");
    expect(panel).not.toContain("canReadProtected");
  });
});
