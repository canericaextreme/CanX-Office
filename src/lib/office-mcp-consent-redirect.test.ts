import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("isolated consent bridge runtime compatibility", () => {
  it("never uses redirect:'error' (unsupported on Cloudflare Workers) and refuses redirects", () => {
    const src = readFileSync("src/lib/office-mcp-consent.functions.ts", "utf8");
    expect(src).not.toMatch(/redirect:\s*['"]error/);
    expect(src).toMatch(/redirect:'manual'/);
    expect(src).toMatch(/status>=300&&r\.status<400\)return blocked/);
  });
});
