import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clockwiseOfficeRooms, OFFICE_MAP_ROOMS } from "./office-map";
import { SYNOPSIS_REQUEST, isSynopsisListRequest, sanitizeLabelPositions, synopsisForModel, synopsisListAnswer } from "./synopsis-context";

const numbered = (text: string) => text.split("\n").filter((l) => /^- \d+\. /.test(l)).map((l) => l.replace(/^- \d+\. /, "").split(":")[0]);

describe("Synopsis list in Elsie's context", () => {
  it("numbers the map rooms exactly as the Synopsis menu does", () => {
    const list = numbered(synopsisForModel(null, false));
    expect(list).toEqual(clockwiseOfficeRooms().map((r) => r.label));
    expect(list).toHaveLength(OFFICE_MAP_ROOMS.length);
    expect(list[0]).toBe("Reception");
  });

  it("follows the label positions saved on John's device", () => {
    // Move Future right next to Reception's angle: it becomes entry 2.
    const reception = OFFICE_MAP_ROOMS.find((r) => r.route === "/reception")!;
    const positions = sanitizeLabelPositions({ "20": { x: reception.x + 0.5, y: reception.y + 0.5 } })!;
    const list = numbered(synopsisForModel(positions, false));
    expect(list).toEqual(clockwiseOfficeRooms(positions).map((r) => r.label));
    expect(synopsisForModel(positions, false)).toContain("saved on John's device");
    expect(synopsisForModel(null, false)).toContain("default room-label positions");
  });

  it("lists Elsie first and the centre rooms unnumbered, with texts on request", () => {
    const text = synopsisForModel(null, true);
    const items = text.split("\n").filter((l) => l.startsWith("- "));
    expect(items[0]).toMatch(/^- \(unnumbered\) Elsie — Office Manager: Elsie is your Office Manager/);
    expect(text).toContain("(unnumbered) CanX Brain");
    expect(text).toMatch(/- 1\. Reception: Reception is the starting point/);
    expect(synopsisForModel(null, false)).not.toContain("Reception is the starting point");
  });

  it("drops untrusted or unknown positions", () => {
    expect(sanitizeLabelPositions(null)).toBeNull();
    expect(sanitizeLabelPositions([])).toBeNull();
    expect(sanitizeLabelPositions({ "99": { x: 1, y: 1 }, "01": { x: "a", y: 2 }, "02": { x: Infinity, y: 1 }, "03": { x: 5, y: 6 } })).toEqual({ "03": { x: 5, y: 6 } });
  });

  it("recognises John's Synopsis questions from 17 Oct", () => {
    for (const q of ["Okay, and does that match with what's on the synopsis?", "Read the synopsis list from one to nineteen that we have.", "Start at Reception and go clockwise, and tell me all the offices."]) expect(SYNOPSIS_REQUEST.test(q)).toBe(true);
    expect(SYNOPSIS_REQUEST.test("How is Finance doing?")).toBe(false);
  });

  it("is wired into the typed Elsie context and both browser send paths", () => {
    const server = readFileSync("src/lib/manager.functions.ts", "utf8");
    expect(server).toContain("synopsisForModel(data.labelPositions ?? null, SYNOPSIS_REQUEST.test(latestUser))");
    expect(server).toContain("sanitizeLabelPositions(");
    const browser = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(browser.match(/labelPositions: readOfficeLabelPositions\(\)/g)).toHaveLength(2);
  });
});

describe("reading the Synopsis list without a model", () => {
  it("recognises the list requests John made by voice on 17 Oct", () => {
    for (const q of [
      "Tell me all the rooms in the office starting with Reception and going clockwise.",
      "Let's have a, tell me all the rooms in the office, starting with reception and going clockwise.",
      "No, no, no, no, no, that's all over the place. Go start at reception and go clockwise.",
      "List all the rooms in the office starting from Reception and going clockwise in the correct order.",
      "Okay, give me, give me the list on the synopsis list.",
      "Read the exact Synopsis list, starting at Reception and going clockwise, in the correct order.",
      "Read the synopsis list from one to nineteen that we have.",
    ]) expect(isSynopsisListRequest(q)).toBe(true);
  });

  it("leaves single-room and comparison questions to the Office reasoner", () => {
    for (const q of ["Okay, and does that match with what's on the synopsis?", "What does the synopsis say about Finance?", "How is Finance doing?", "Don't read the synopsis list yet."])
      expect(isSynopsisListRequest(q)).toBe(false);
  });

  it("numbers the 19 map rooms exactly like the menu and keeps the other pages unnumbered", () => {
    const answer = synopsisListAnswer(null);
    const lines = answer.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines.map((l) => l.replace(/^\d+\. /, ""))).toEqual(clockwiseOfficeRooms({}).map((r) => r.label));
    expect(lines).toHaveLength(19);
    expect(lines[0]).toBe("1. Reception");
    expect(answer).toContain("First, unnumbered: Elsie — Office Manager.");
    expect(answer).toContain("Centre and control wall: CanX Brain, Analytics Control Wall.");
    expect(answer).toMatch(/Other Office pages: .*Round Table\./);
  });

  it("follows John's saved label positions", () => {
    const reception = OFFICE_MAP_ROOMS.find((r) => r.route === "/reception")!;
    const positions = sanitizeLabelPositions({ "20": { x: reception.x + 0.5, y: reception.y + 0.5 } })!;
    const answer = synopsisListAnswer(positions);
    const list = answer.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
    expect(list).toEqual(clockwiseOfficeRooms(positions).map((r) => r.label));
  });

  it("answers before any room inspection or paid Office call, for typed and spoken requests", () => {
    const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    const reader = manager.indexOf("isSynopsisListRequest(request)");
    expect(reader).toBeGreaterThan(-1);
    expect(reader).toBeLessThan(manager.indexOf("const command = parseRoomCommand(request"));
  });
});
