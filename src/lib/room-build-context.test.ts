import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { ROOM_TARGETS } from "./room-snapshot";
import { roomBuildLine, roomScreenFile, withRoomContext } from "./room-build-context";
import { officeBuildProtectedCategory } from "./codex-task-handoff";

describe("room context for build requests", () => {
  it("every room's screen file really exists", () => {
    for (const t of ROOM_TARGETS) {
      const file = roomScreenFile(t.route);
      expect(file, t.route).not.toBeNull();
      expect(existsSync(file!), file!).toBe(true);
    }
  });
  it("Reception's home page maps to the Reception screen; unknown pages give nothing", () => {
    expect(roomScreenFile("/")).toBe("src/routes/_office/reception.tsx");
    expect(roomBuildLine("/auth/reset-password")).toBeNull();
    expect(withRoomContext("Make the header bigger.", undefined)).toBe("Make the header bigger.");
  });
  it("adds the room and its screen file to a plain screen request", () => {
    expect(withRoomContext("Make the header bigger.", "/work-board")).toBe(
      "Make the header bigger.\nRequested Office room: Work Board (/work-board); screen file src/routes/_office/work-board.tsx.");
  });
  it("never changes the protected-word decision (Finance, Legal, Approvals rooms)", () => {
    for (const t of ROOM_TARGETS) {
      const req = "Make the header bigger.";
      const out = withRoomContext(req, t.route);
      expect(officeBuildProtectedCategory(out), t.route).toBe(officeBuildProtectedCategory(req));
    }
  });
  it("keeps the saved-task limit and never repeats the file", () => {
    const long = "x".repeat(1990);
    expect(withRoomContext(long, "/work-board")).toBe(long);
    const named = "Fix src/routes/_office/work-board.tsx header.";
    expect(withRoomContext(named, "/work-board")).toBe(named);
  });
});
