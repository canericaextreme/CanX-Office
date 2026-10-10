import { describe, expect, it } from "vitest";
import { allOfficeRoutes } from "@/lib/room-capture";
import { allRoomBriefs, officeTour, roomBrief, skillAssurance } from "@/lib/room-brief";

describe("office tour", () => {
  it("follows the established Synopsis order and visits every room exactly once", () => {
    const tour = officeTour();
    expect(tour[0]).toMatchObject({ key: "elsie", route: null, group: "office-manager", order: 1 });
    expect(tour[1]?.route).toBe("/reception");
    expect(tour.slice(1, 4).map((s) => s.route)).toEqual(["/reception", "/owner-desk", "/family-continuity"]);
    const rooms = tour.filter((s) => s.route).map((s) => s.route as string);
    expect(new Set(rooms).size).toBe(rooms.length);
    expect([...rooms].sort()).toEqual([...allOfficeRoutes()].sort());
    expect(tour.at(-1)?.route).toBe("/round-table");
    expect(tour.map((s) => s.order)).toEqual(tour.map((_, i) => i + 1));
  });

  it("puts the Brain and Analytics wall after the clockwise rooms", () => {
    const keys = officeTour().map((s) => s.key);
    expect(keys.indexOf("/brain")).toBeGreaterThan(keys.indexOf("/future"));
    expect(keys.indexOf("/analytics")).toBe(keys.indexOf("/brain") + 1);
  });
});

describe("room briefs", () => {
  it("exist for every room, in tour order, with neighbours", () => {
    const briefs = allRoomBriefs();
    expect(briefs).toHaveLength(24);
    expect(briefs[0]?.route).toBe("/reception");
    expect(briefs[0]?.previousRoute).toBeNull();
    expect(briefs.at(-1)?.nextRoute).toBeNull();
    for (let i = 1; i < briefs.length; i++) expect(briefs[i]?.previousRoute).toBe(briefs[i - 1]?.route);
  });

  it("returns nothing for an unknown room instead of guessing", () => {
    expect(roomBrief("/nope")).toBeNull();
    expect(roomBrief("/reception/../finance")).toBeNull();
  });

  it("separates documented from verified", () => {
    for (const brief of allRoomBriefs()) {
      expect(brief.assurance.documentedInCode).toBe(true);
      expect(brief.assurance.liveRoomCheck).toBe("unknown");
      expect(brief.assurance.ownerVerifiedSkillCount).toBe(brief.skills.filter((s) => s.assurance === "owner-verified").length);
    }
    expect(skillAssurance({ instructionReady: true, toolConnected: true, liveTested: true })).toBe("owner-verified");
    expect(skillAssurance({ instructionReady: true, toolConnected: true, liveTested: false })).toBe("inputs-connected");
    expect(skillAssurance({ instructionReady: true, toolConnected: false, liveTested: false })).toBe("instructions-only");
    expect(skillAssurance({ instructionReady: false, toolConnected: false, liveTested: false })).toBe("outline");
  });

  it("reports what is missing instead of filling it in", () => {
    const research = roomBrief("/research")!;
    expect(research.limits.join(" ")).toMatch(/No live web or standards monitoring tool/);
    const future = roomBrief("/future")!;
    expect(future.reserved).toBe(true);
    expect(future.limits.join(" ")).toMatch(/Reserved room/);
    const ideas = roomBrief("/idea-garage")!;
    expect(ideas.limits.join(" ")).toMatch(/device only/i);
  });

  it("marks Legal as a two-step room and Brain as standard", () => {
    expect(roomBrief("/legal")?.tier).toBe("two_step");
    expect(roomBrief("/legal")?.limits.join(" ")).toMatch(/two-step/);
    expect(roomBrief("/brain")?.tier).toBe("standard");
  });

  it("names documented connections with their source", () => {
    const reception = roomBrief("/reception")!;
    expect(reception.connections.some((c) => c.route === "/owner-desk" && c.source === "brain-map-link")).toBe(true);
    expect(reception.connections.every((c) => c.route !== "/reception")).toBe(true);
  });

  it("carries no secrets or saved record contents", () => {
    const text = JSON.stringify(allRoomBriefs());
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|password\s*[:=]/i);
  });
});
