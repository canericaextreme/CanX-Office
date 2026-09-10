import { describe, expect, it } from "vitest";

import { backupsRowState, databaseRowState } from "./systems-status";

describe("databaseRowState", () => {
  it("is grey and honest when nothing is configured", () => {
    expect(databaseRowState(false, false)).toEqual({
      tone: "grey",
      note: "Not connected. Sign-in and shared saving are unavailable.",
    });
  });

  it("stays yellow when configured but no owner session exists", () => {
    expect(databaseRowState(true, false).tone).toBe("yellow");
  });

  it("is green and names the confirmed checks for a verified owner", () => {
    const state = databaseRowState(true, true);
    expect(state.tone).toBe("green");
    expect(state.note).toContain("owner role");
    expect(state.note).toContain("two-step verification");
  });

  it("never goes green without configuration, even if a session claims owner", () => {
    expect(databaseRowState(false, true).tone).toBe("grey");
  });
});

describe("backupsRowState", () => {
  it("does not claim a missing account once the owner is signed in", () => {
    const state = backupsRowState(true, true);
    expect(state.note).not.toContain("no CanX-owned account");
    expect(state.note).toContain("not been tested");
  });

  it("never claims backups are working", () => {
    for (const state of [backupsRowState(false, false), backupsRowState(true, false), backupsRowState(true, true)]) {
      expect(state.tone).not.toBe("green");
      expect(state.note.toLowerCase()).toMatch(/not been tested|not tested/);
    }
  });
});
