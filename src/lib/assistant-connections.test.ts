import { describe, expect, it } from "vitest";
import { cleanConnectionRows, describeConnection } from "./assistant-connections";

const row = (over: Record<string, unknown> = {}) => ({
  identity: "chatgpt",
  enabled: true,
  consent_active: true,
  live_sessions: 1,
  last_active_at: "2026-10-11T02:00:00Z",
  ...over,
});

describe("assistant connector sign-in", () => {
  it("says connected only when a live sign-in exists", () => {
    expect(describeConnection(row(), true).state).toBe("connected");
  });
  it("separates approved-but-signed-out from not approved", () => {
    expect(describeConnection(row({ live_sessions: 0 }), true).state).toBe("needs_reconnect");
    expect(describeConnection(row({ consent_active: false }), true).state).toBe("not_approved");
    expect(describeConnection(row({ enabled: false }), true).state).toBe("not_approved");
    expect(describeConnection(undefined, true).state).toBe("not_approved");
  });
  it("never reports disconnected when the check itself failed", () => {
    expect(describeConnection(undefined, false).state).toBe("unknown");
  });
  it("rejects malformed database replies instead of guessing", () => {
    expect(cleanConnectionRows(null)).toBeNull();
    expect(
      cleanConnectionRows([
        { identity: "claude", enabled: true, consent_active: true, live_sessions: "1" },
      ]),
    ).toBeNull();
    expect(cleanConnectionRows([row({ last_active_at: null })])).toEqual([
      row({ last_active_at: null }),
    ]);
  });
});
