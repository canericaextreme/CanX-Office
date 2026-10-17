import { describe, expect, it } from "vitest";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { parseRoomCommand } from "./manager-room-commands";

describe("direct owner room requests", () => {
  it("opens Legal and routes visual follow-ups to a fresh inspection of the current room", () => {
    expect(parseRoomCommand("Elsie, show me the Legal room", "/reception")).toMatchObject({ kind: "look", room: { id: "legal" } });
    for (const question of ["How many cards are there?", "How many blue?", "What colours are the cards?", "Is anything visibly broken?", "Can you make this room more interactive?", "Walk me through this room and help me fix any problems", "What's wrong with this room?"]) {
      expect(parseRoomCommand(question, "/legal")).toMatchObject({ kind: "look", room: { id: "legal" }, question });
    }
    expect(parseRoomCommand("How many cards are in Communications?", "/legal")).toMatchObject({ kind: "look", room: { route: "/communications" } });
    expect(parseRoomCommand("How many blue?", "/not-a-room")).toBeNull();
    expect(parseRoomCommand("How many invoices were paid?", "/legal")).toBeNull();
    expect(parseRoomCommand("Do not count the cards", "/legal")).toBeNull();
  });
  it.each(OFFICE_ROOM_IDENTITIES)("can inspect $shortLabel without the owner opening it", room => {
    expect(parseRoomCommand(`Check ${room.shortLabel}`, "/")).toMatchObject({ kind: "look", room: { id: room.id, route: room.route } });
    expect(parseRoomCommand(`Elsie, open the ${room.shortLabel} room and let's work on that`, "/")).toMatchObject({ kind: "look", room: { id: room.id, route: room.route } });
  });
  it.each(["Elsie", "Astra", "Data"])("accepts %s as the manager name", name => {
    expect(parseRoomCommand(`${name}, check Finance`, "/")).toMatchObject({ kind: "look", room: { id: "finance" } });
    expect(parseRoomCommand(`Move ${name} window to the left`, "/")).toEqual({ kind: "move-panel", side: "left" });
  });
  it("resolves the subscription watch phrasing and the open room", () => {
    expect(parseRoomCommand("Astra, please go into the subscription watch room and tell me what you see", "/")?.kind).toBe("look");
    expect(parseRoomCommand("Look at this room", "/finance")).toMatchObject({ kind: "look", room: { id: "finance" } });
  });
  it.each(["Do not check Finance", "How would you check Finance?", 'Example: "check Finance"', "Open https://example.com", "Delete all reports", "Approve spending", "Check an unknown room"])("does not execute %s", request => {
    expect(parseRoomCommand(request, "/")).toBeNull();
  });
  it("opens a room when the request starts with a misheard name or a filler word (17 Oct)", () => {
    expect(parseRoomCommand("Kirby, open me the safe highways room and let's talk about it.", "/reception")).toMatchObject({ kind: "look", room: { id: "safe-highways" } });
    expect(parseRoomCommand("Okay, so, open the Finance room", "/")).toMatchObject({ kind: "look", room: { id: "finance" } });
    expect(parseRoomCommand("Elsie, please check Legal", "/")).toMatchObject({ kind: "look", room: { id: "legal" } });
    expect(parseRoomCommand("Finance, what's in it?", "/")).toBeNull();
    expect(parseRoomCommand("Kirby, don't open Finance", "/")).toBeNull();
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
