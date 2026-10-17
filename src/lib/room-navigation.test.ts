import { describe, expect, it } from "vitest";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { parseRoomCommand } from "./manager-room-commands";
import { handoffStatusFromRoomOutcome } from "./companion-bridge";
import { isOfficeRoomRoute, parseRoomNavigation, roomNavigationResult } from "./room-navigation";

describe("Elsie's room-navigation command", () => {
  it("opens the Safe Highways room on the desk as display-only navigation", () => {
    expect(
      parseRoomCommand("Elsie, open the Safe Highways room on the desk", "/reception"),
    ).toMatchObject({ kind: "navigate", room: { id: "safe-highways", route: "/safe-highways" } });
    for (const request of [
      "Take me to Finance",
      "Navigate to the Work Board",
      "Switch to Legal please",
      "Show the Brain on my screen.",
      "Could you pull up Analytics on the screen?",
      "Open /approvals on the desk",
      // Bare "open" only moves the screen too: no picture, no paid review.
      "Open the Safe Highways room",
      "Elsie, open the Blueprint room.",
      "open me the Safe Highways room",
      "Go to Finance",
      "Go into the Records room",
    ]) {
      expect(parseRoomCommand(request, "/")?.kind).toBe("navigate");
    }
  });

  it.each(OFFICE_ROOM_IDENTITIES)("recognises $shortLabel by name and route", (room) => {
    expect(parseRoomNavigation(`Open the ${room.shortLabel} room on the desk`)).toEqual({
      kind: "navigate",
      room,
    });
    expect(parseRoomNavigation(`Take me to ${room.label}`)).toEqual({ kind: "navigate", room });
    expect(isOfficeRoomRoute(room.route)).toBe(true);
  });

  it("refuses unrecognised room names with a clear message and opens nothing", () => {
    for (const request of [
      "Open the Kitchen room on the desk",
      "Take me to the Garage room",
      "Navigate to the pool page",
    ]) {
      const command = parseRoomCommand(request, "/");
      expect(command).toMatchObject({ kind: "navigate-refused", reason: "unknown" });
      expect(command && "message" in command ? command.message : "").toMatch(
        /couldn't find a CanX Office room called .*Nothing was opened.*Safe Highways/,
      );
    }
    // Not navigation at all: left for Elsie's normal answer.
    for (const request of [
      "Switch to Spanish",
      "Take me through how approvals work",
      "Open a discussion about pricing",
      "Go to sleep",
    ]) {
      expect(parseRoomNavigation(request)).toBeNull();
    }
  });

  it.each([
    "Open https://news-site.com",
    "Open https://canx-office.lovable.app.attacker.net on the desk",
    "Take me to google.com",
    "Open www.youtube.com on my screen",
    "Open the Safe Highways website on the desk",
    "Open Finance in a new tab on the screen",
    "Switch to my other browser tab",
    "Navigate to //evil.attacker.org",
    "Open the Gmail page on the desk",
  ])("blocks the external destination %s", (request) => {
    expect(parseRoomCommand(request, "/")).toMatchObject({
      kind: "navigate-refused",
      reason: "external",
      message: expect.stringMatching(/only open CanX Office rooms/),
    });
  });

  it("only treats the Office's own room routes as destinations", () => {
    for (const route of [
      "https://canx-office.lovable.app/finance",
      "//evil.com",
      "/finance?next=https://x.com",
      "/admin",
      "javascript:alert(1)",
      "/../finance",
      "",
    ]) {
      expect(isOfficeRoomRoute(route)).toBe(false);
    }
  });

  it("keeps read-only inspection and other commands on their own paths", () => {
    expect(parseRoomCommand("Elsie, show me the Legal room", "/")?.kind).toBe("look");
    expect(parseRoomCommand("Check Finance", "/")?.kind).toBe("look");
    expect(parseRoomCommand("Open the Legal room and tell me what you see", "/")?.kind).toBe(
      "look",
    );
    expect(parseRoomCommand("Go into the subscription watch room and check it", "/")?.kind).toBe(
      "look",
    );
    expect(parseRoomCommand("Elsie, open the Finance room and let's work on that", "/")?.kind).toBe(
      "look",
    );
    expect(parseRoomCommand("How many cards are on the desk?", "/legal")?.kind).toBe("look");
    expect(
      parseRoomCommand("Open the Legal room on the desk and tell me what you see", "/")?.kind,
    ).toBe("look");
    expect(parseRoomCommand("Don't open Finance on the desk", "/")).toBeNull();
    expect(parseRoomCommand("Add a report to Finance: take me to the bank", "/")?.kind).toBe(
      "report",
    );
  });

  it("confirms only when the screen really landed on the room", () => {
    const room = OFFICE_ROOM_IDENTITIES.find((r) => r.id === "safe-highways")!;
    expect(roomNavigationResult(room, "/safe-highways")).toMatchObject({
      ok: true,
      message: expect.stringMatching(
        /^Opened Safe Highways on this screen.*nothing was read or changed/,
      ),
    });
    expect(roomNavigationResult(room, "/safe-highways/")).toMatchObject({ ok: true });
    expect(roomNavigationResult(room, "/reception")).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Navigation isn't available right now/),
    });
    expect(roomNavigationResult(room, null).ok).toBe(false);
  });

  it("reports navigation outcomes on the handoff card without claiming a record change", () => {
    expect(handoffStatusFromRoomOutcome("display").detail).toMatch(/No office record was changed/);
    expect(handoffStatusFromRoomOutcome("navigate_failed")).toEqual({
      status: "failed",
      detail: "The room did not open on this screen. Nothing was changed.",
      canResend: true,
    });
  });
});
