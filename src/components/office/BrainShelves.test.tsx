import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAIN_CAST, BRAIN_SHELVES, BrainShelves } from "./BrainShelves";
import brainRouteSource from "../../routes/_office/brain.tsx?raw";

const EXPECTED_SHELVES = [
  [1, "THE COMPASS", "Yellow"],
  [2, "THE RULEBOOK", "Red"],
  [3, "THE WORKSHOP", "Green"],
  [4, "THE PIGGY BANK", "Orange"],
  [5, "THE LIBRARY", "Blue"],
  [6, "THE DIARY", "Purple"],
  [7, "THE LOGBOOK", "Light grey"],
  [8, "THE LOST-AND-FOUND", "Dark grey"],
] as const;

/** WCAG 2.x relative luminance / contrast ratio for #RRGGBB colours. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const html = renderToStaticMarkup(<BrainShelves />);
const decoded = html.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

describe("Brain shelves display", () => {
  it("defines exactly the eight shelves, in order, with the owner's names and colours", () => {
    expect(BRAIN_SHELVES.map((s) => [s.number, s.name, s.colourName])).toEqual(EXPECTED_SHELVES);
  });

  it("renders every shelf's number, name, colour name and one-line description as text", () => {
    for (const shelf of BRAIN_SHELVES) {
      expect(decoded).toContain(shelf.name);
      expect(decoded).toContain(`Shelf ${shelf.number}: `);
      expect(decoded).toContain(`${shelf.colourName} shelf`);
      expect(decoded).toContain(shelf.description);
      expect(shelf.description.trim().length).toBeGreaterThan(0);
      expect(shelf.description).not.toContain("\n");
    }
    expect(html.match(/data-shelf="/g)?.length).toBe(8);
  });

  it("shows shelves in numbered order", () => {
    const positions = BRAIN_SHELVES.map((s) => decoded.indexOf(s.name));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("uses the requested descriptions", () => {
    const byName = Object.fromEntries(BRAIN_SHELVES.map((s) => [s.name, s.description.toLowerCase()]));
    expect(byName["THE COMPASS"]).toContain("goals and style");
    expect(byName["THE RULEBOOK"]).toContain("standing rules");
    expect(byName["THE WORKSHOP"]).toContain("projects and apps");
    expect(byName["THE PIGGY BANK"]).toContain("receipts");
    expect(byName["THE LIBRARY"]).toContain("documents and files");
    expect(byName["THE DIARY"]).toContain("conversation");
    expect(byName["THE LOGBOOK"]).toContain("build and connection");
    expect(byName["THE LOST-AND-FOUND"]).toContain("duplicates");
  });

  it("gives every shelf badge at least 4.5:1 text contrast and distinct colours", () => {
    for (const shelf of BRAIN_SHELVES) {
      expect(contrast(shelf.colour, shelf.ink), shelf.name).toBeGreaterThanOrEqual(4.5);
    }
    expect(new Set(BRAIN_SHELVES.map((s) => s.colour)).size).toBe(8);
  });

  it("keeps colour decorative: the coloured number badge is hidden from screen readers", () => {
    expect(html).toMatch(/aria-hidden="true"[^>]*>1</);
  });

  it("renders the cast strip with all five roles", () => {
    expect(BRAIN_CAST).toEqual([
      { who: "Elsie", role: "Front-Desk Manager" },
      { who: "The writing assistant", role: "the Drafter" },
      { who: "The reviewing assistant", role: "the Second Pair of Eyes" },
      { who: "The Brain", role: "the Memory Keeper" },
      { who: "The builders", role: "the Workshop Crew" },
    ]);
    for (const member of BRAIN_CAST) {
      expect(decoded).toContain(member.who);
      expect(decoded).toContain(member.role);
    }
    expect(html.match(/data-cast="/g)?.length).toBe(5);
  });

  it("uses responsive layout classes for phone and desktop", () => {
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
    expect(html).toContain("lg:grid-cols-5");
  });
});

describe("Brain room page composition", () => {
  it("adds the shelves without removing any existing Brain section", () => {
    for (const part of ["<BrainShelves />", "<BrainHub />", "<BrainDocuments />", "<BrainMemory />", "<BrainMap />", "Growth history"]) {
      expect(brainRouteSource).toContain(part);
    }
  });
});
