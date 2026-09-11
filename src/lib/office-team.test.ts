import { describe, expect, it } from "vitest";
import { DEFAULT_TEAM, parseTeam, roomLabel, teamForManager } from "@/lib/office-team";
import { sanitizeTeam, teamContextLines } from "@/lib/manager.functions";

describe("office team roster", () => {
  it("ships the planned departmental roles with real rooms", () => {
    expect(DEFAULT_TEAM.length).toBeGreaterThanOrEqual(5);
    for (const member of DEFAULT_TEAM) {
      expect(roomLabel(member.roomId)).not.toBe("Unassigned room");
    }
  });

  it("drops rows without a name, id or known room", () => {
    const parsed = parseTeam([
      { id: "a", name: "Finance Officer", role: "Costs", roomId: "finance", focus: "" },
      { id: "b", name: "", roomId: "finance" },
      { id: "c", name: "Ghost", roomId: "not-a-room" },
      { name: "No id", roomId: "finance" },
    ]);
    expect(parsed.map((m) => m.name)).toEqual(["Finance Officer"]);
  });

  it("sends only name, role and room to the manager", () => {
    const [first] = teamForManager(DEFAULT_TEAM);
    expect(Object.keys(first!).sort()).toEqual(["name", "role", "room"]);
  });
});

describe("manager roster context", () => {
  it("caps and trims roster rows from the browser", () => {
    const rows = sanitizeTeam([{ name: "  Ops Lead  ", role: 5, room: "Work Board" }, { name: "" }, "nope"]);
    expect(rows).toEqual([{ name: "Ops Lead", role: "", room: "Work Board" }]);
  });

  it("labels the roster as device-only data", () => {
    const lines = teamContextLines(sanitizeTeam(teamForManager(DEFAULT_TEAM)));
    expect(lines[0]).toContain("device-only");
    expect(lines.join("\n")).toContain("Finance Officer");
  });

  it("says plainly when no team is recorded", () => {
    expect(teamContextLines([])[0]).toContain("no team members are recorded");
  });
});
