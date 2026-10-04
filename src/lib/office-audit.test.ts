import { describe, expect, it } from "vitest";
import { buildOfficeAudit, formatOfficeAudit, parseOfficeAuditCommand } from "./office-audit";
import { ROOM_TARGETS, assembleSnapshot, type RoomSnapshot } from "./room-snapshot";
import { OFFICE_SKILLS } from "./office-skills";

const build = { tokenPresent: false, enabled: false, liveCheck: "not-attempted" as const, detail: "" };
const allRead = (route: string): RoomSnapshot => {
  const t = ROOM_TARGETS.find((x) => x.route === route)!;
  return assembleSnapshot(t, t.sources.map((s) => ({ key: s.key, label: s.label, kind: s.kind, status: "read" as const, count: 0, items: [], latestAt: null, detail: "" })), "2026-10-04T00:00:00Z", "b1");
};

describe("whole-office audit", () => {
  it("parses run, status, negated and hypothetical wording", () => {
    expect(parseOfficeAuditCommand("Elsie, check all the rooms and tell me what's missing")).toBe("run");
    expect(parseOfficeAuditCommand("Run a whole office audit")).toBe("run");
    expect(parseOfficeAuditCommand("Have you checked all the rooms?")).toBe("status");
    expect(parseOfficeAuditCommand("Don't check all rooms")).toBeNull();
    expect(parseOfficeAuditCommand("If you could audit every room, what would happen")).toBeNull();
    expect(parseOfficeAuditCommand("follow all the skills in the Subscriptions room")).toBeNull();
    expect(parseOfficeAuditCommand("Check all rooms + reversible save test")).toBeNull();
  });

  it("enumerates every room and every installed skill without a cap and never marks live-tested", () => {
    const r = buildOfficeAudit({ snapshots: new Map(), build, checkedAt: "t" });
    expect(r.rooms).toHaveLength(ROOM_TARGETS.length);
    expect(r.totals.skillsInstalled).toBe(OFFICE_SKILLS.filter((s) => s.instructionReady).length);
    expect(r.liveTested).toBe(false);
    expect(r.rooms.find((x) => x.route === "/future")!.status).toBe("reserved");
    expect(r.rooms.find((x) => x.route === "/reception")!.status).toBe("blocked");
  });

  it("failed source reads are partial, never ready; missing inputs stay explicit", () => {
    const fin = allRead("/finance");
    fin.sources = fin.sources.map((s) => s.key === "finance-receipts" ? { ...s, status: "denied", detail: "needs two-step" } : s);
    const snaps = new Map<string, RoomSnapshot | null>([["/finance", fin], ["/research", allRead("/research")], ["/records", allRead("/records")]]);
    const r = buildOfficeAudit({ snapshots: snaps, build, checkedAt: "t" });
    expect(r.rooms.find((x) => x.route === "/finance")!.status).toBe("partial");
    const research = r.rooms.find((x) => x.route === "/research")!;
    expect(research.status).toBe("partial");
    expect(research.missingInputs.join(" ")).toMatch(/web/i);
    expect(r.rooms.find((x) => x.route === "/records")!.status).toBe("ready");
    expect(formatOfficeAudit(r)).toMatch(/Build handoff .*not connected/);
  });
});
