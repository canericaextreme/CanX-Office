import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(import.meta.dirname, "OfficeNav.tsx");
const source = fs.readFileSync(sourcePath, "utf-8");

describe("OfficeNav view toggle", () => {
  it("uses the explicit labels Simple view and Office view", () => {
    expect(source).toContain('"Simple view"');
    expect(source).toContain('"Office view"');
  });

  it("does not hide the toggle label at any supported width", () => {
    // The visible label span must not use a responsive hidden class.
    const toggleStart = source.indexOf('aria-label={label}');
    expect(toggleStart).toBeGreaterThan(-1);

    const buttonEnd = source.indexOf("</Button>", toggleStart);
    expect(buttonEnd).toBeGreaterThan(toggleStart);

    const buttonSlice = source.slice(toggleStart, buttonEnd);
    expect(buttonSlice).not.toContain("hidden");
  });

  it("derives both label strings from the viewMode prop", () => {
    // A single ternary should choose the label based on the current mode.
    expect(source).toMatch(/viewMode\s*===\s*"3d"\s*\?\s*"Simple view"\s*:\s*"Office view"/);
  });

  it("uses the same label for the accessible name and visible text", () => {
    // The aria-label and the visible span both reference the same `label` variable.
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("<span>{label}</span>");
  });
});
