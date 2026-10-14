import { describe, it, expect } from "vitest";
import { diagnoseConnection } from "./connection-diagnosis";

describe("rules-only connection diagnosis", () => {
  it("matches the isolated sign-in message as a known cause", () => {
    const r = diagnoseConnection("Isolated Office sign-in is unavailable. No access was confirmed.");
    expect(r.findings[0]?.id).toBe("isolated-consent-unavailable");
  });
  it("redacts tokens, keys and emails before matching or display", () => {
    const r = diagnoseConnection("Bearer abc.def.ghi sk-1234567890abcdef john@example.com code=XYZ123 eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl");
    expect(r.redacted).not.toMatch(/abc\.def|sk-1234|john@|XYZ123|eyJhbGci/);
    expect(r.redactionCount).toBeGreaterThan(0);
  });
  it("returns no findings for unrelated text without claiming success", () => {
    expect(diagnoseConnection("hello").findings).toEqual([]);
  });
  it("bounds input length", () => {
    expect(diagnoseConnection("x".repeat(20000)).redacted.length).toBe(8000);
  });
});
