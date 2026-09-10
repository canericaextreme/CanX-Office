import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(import.meta.dirname, "index.tsx");
const source = fs.readFileSync(sourcePath, "utf-8");

describe("Reception layout regression", () => {
  it("keeps the two-column dashboard grid with a 340px StatusPanel column", () => {
    const gridStart = source.indexOf("xl:grid-cols-[minmax(0,1fr)_340px]");
    expect(gridStart).toBeGreaterThan(-1);
  });

  it("renders BrainMap inside the wide left column, below Quick answers", () => {
    const gridStart = source.indexOf("xl:grid-cols-[minmax(0,1fr)_340px]");
    const leftColStart = source.indexOf('className="min-w-0 space-y-6"', gridStart);
    expect(leftColStart).toBeGreaterThan(gridStart);

    const quickAnswers = source.indexOf("Quick answers", leftColStart);
    const brainIndex = source.indexOf("<BrainMap />", leftColStart);
    expect(brainIndex).toBeGreaterThan(quickAnswers);

    // BrainMap container spans the available column width.
    const containerStart = source.lastIndexOf("<div", brainIndex);
    const containerTag = source.slice(containerStart, brainIndex);
    expect(containerTag).toContain("max-w-full");
    expect(containerTag).toContain("min-w-0");
  });

  it("keeps BrainMap out of the narrow right StatusPanel column", () => {
    const statusPanelIndex = source.indexOf("<StatusPanel");
    expect(statusPanelIndex).toBeGreaterThan(-1);

    const brainIndex = source.indexOf("<BrainMap />");
    // BrainMap must come before StatusPanel in the left column.
    expect(brainIndex).toBeLessThan(statusPanelIndex);

    // No BrainMap anywhere after the StatusPanel column opens.
    const rightCol = source.slice(statusPanelIndex);
    expect(rightCol).not.toContain("<BrainMap />");
  });
});
