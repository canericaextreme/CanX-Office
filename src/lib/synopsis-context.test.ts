import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { clockwiseOfficeRooms, OFFICE_MAP_ROOMS } from "./office-map";
import { SYNOPSIS_REQUEST, sanitizeLabelPositions, synopsisForModel } from "./synopsis-context";

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
