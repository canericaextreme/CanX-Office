import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(import.meta.dirname, "index.tsx");
const source = fs.readFileSync(sourcePath, "utf-8");

describe("Reception layout regression", () => {
  it("keeps BrainMap out of the 340px dashboard sidebar", () => {
    // The xl two-column grid wraps Quick answers and StatusPanel.
    // BrainMap must not appear inside that grid's right column.
    const gridStart = source.indexOf("xl:grid-cols-[minmax(0,1fr)_340px]");
    expect(gridStart).toBeGreaterThan(-1);

    const gridEnd = source.indexOf("</div>", gridStart);
    expect(gridEnd).toBeGreaterThan(gridStart);

    const gridSlice = source.slice(gridStart, gridEnd);
    expect(gridSlice).not.toContain("<BrainMap />");
  });

  it("renders BrainMap in a separate full-width section below the dashboard grid", () => {
    const brainIndex = source.indexOf("<BrainMap />");
    expect(brainIndex).toBeGreaterThan(-1);

    const gridStart = source.indexOf("xl:grid-cols-[minmax(0,1fr)_340px]");
    expect(brainIndex).toBeGreaterThan(gridStart);

    // BrainMap sits inside a container that spans the available width.
    const containerStart = source.lastIndexOf("<div", brainIndex);
    const containerTag = source.slice(containerStart, brainIndex);
    expect(containerTag).toContain("max-w-full");
    expect(containerTag).toContain("min-w-0");
  });
});
