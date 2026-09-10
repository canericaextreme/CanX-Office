import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRoute(name: string) {
  return readFileSync(resolve(here, name), "utf8");
}

describe("Reception route", () => {
  const reception = readRoute("index.tsx");

  it("does not import BrainMap", () => {
    expect(reception).not.toMatch(
      /import\s+\{\s*BrainMap\s*\}\s+from\s+["']@\/components\/office\/BrainMap["']/
    );
  });

  it("does not render BrainMap", () => {
    expect(reception).not.toContain("<BrainMap />");
  });
});

describe("Brain route", () => {
  const brain = readRoute("brain.tsx");

  it("still imports and renders BrainMap", () => {
    expect(brain).toMatch(
      /import\s+\{\s*BrainMap\s*\}\s+from\s+["']@\/components\/office\/BrainMap["']/
    );
    expect(brain).toContain("<BrainMap />");
  });
});
