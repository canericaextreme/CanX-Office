import { describe, expect, it } from "vitest";
import { ROOMS } from "./office-data";
import { parseRoomCommand } from "./manager-room-commands";

describe("direct owner room requests", () => {
  it.each(ROOMS)("can inspect $shortLabel without the owner opening it", room => {
    expect(parseRoomCommand(`Check ${room.shortLabel}`, "/")).toEqual({ kind: "look", room });
  });
  it("resolves the subscription watch phrasing and the open room", () => {
    expect(parseRoomCommand("Astra, please go into the subscription watch room and tell me what you see", "/")?.kind).toBe("look");
    expect(parseRoomCommand("Look at this room", "/finance")).toMatchObject({ kind: "look", room: { id: "finance" } });
  });
  it.each(["Do not check Finance", "How would you check Finance?", 'Example: "check Finance"', "Open https://example.com", "Delete all reports", "Approve spending", "Check an unknown room"])("does not execute %s", request => {
    expect(parseRoomCommand(request, "/")).toBeNull();
  });
  it("keeps the report destination separate from its literal text", () => {
    expect(parseRoomCommand("Add a report to Finance: Check subscriptions tomorrow.", "/")).toMatchObject({ kind: "report", room: { id: "finance" }, content: "Check subscriptions tomorrow." });
    expect(parseRoomCommand("Add a report to the current room saying Road work starts Monday", "/safe-highways")).toMatchObject({ kind: "report", room: { id: "safe-highways" }, content: "Road work starts Monday" });
  });
  it("limits small display changes to known controls", () => {
    expect(parseRoomCommand("Set text size to 28", "/")).toEqual({ kind: "text-size", size: 28 });
    expect(parseRoomCommand("Set text size to 900", "/")).toBeNull();
    expect(parseRoomCommand("Move your window to the left", "/")).toEqual({ kind: "move-panel", side: "left" });
  });
});
