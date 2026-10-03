import { describe, it, expect } from "vitest";
import { evaluateReleaseGate, POST_PUBLISH_ROOM_CHECKS, HEALTH_SCHEDULE, currentBuildVersion, type CheckResult } from "./office-health";

const V = "index-ABC.js";
const at = (n: number) => new Date(Date.UTC(2026, 9, 3, 0, n)).toISOString();
const all = (status: "verified" | "failed", over: Partial<CheckResult> = {}): CheckResult[] =>
  POST_PUBLISH_ROOM_CHECKS.map((c, i) => ({ checkId: c.id, scope: "signed-in-live", status, at: at(i), version: V, ...over }));

describe("office health release gate", () => {
  it("is untested with no results", () => expect(evaluateReleaseGate([], V).state).toBe("untested"));
  it("never all-clears from connectivity or anonymous shell checks", () => {
    expect(evaluateReleaseGate(all("verified", { scope: "connectivity" }), V).state).toBe("untested");
    expect(evaluateReleaseGate(all("verified", { scope: "anonymous-shell" }), V).state).toBe("untested");
    expect(evaluateReleaseGate(all("verified", { scope: "fixture-render" }), V).state).toBe("untested");
  });
  it("ignores results from an older version", () => expect(evaluateReleaseGate(all("verified", { version: "old.js" }), V).state).toBe("untested"));
  it("verifies only when every room passed signed-in on this version", () => expect(evaluateReleaseGate(all("verified"), V).state).toBe("verified"));
  it("a single failed room fails the gate with a next step", () => {
    const r = all("verified"); r.push({ ...r[0]!, status: "failed", at: at(59) });
    const g = evaluateReleaseGate(r, V);
    expect(g.state).toBe("failed"); expect(g.label).toMatch(/Brain/); expect(g.label).toMatch(/recovery point/);
  });
  it("a later pass supersedes an earlier failure (history kept)", () => {
    const r = all("verified"); r.unshift({ ...r[0]!, status: "failed", at: "2026-01-01T00:00:00.000Z" });
    expect(evaluateReleaseGate(r, V).state).toBe("verified");
  });
  it("monitoring is honestly unscheduled", () => expect(HEALTH_SCHEDULE.configured).toBe(false));
  it("Brain saved files is a required room check", () => expect(POST_PUBLISH_ROOM_CHECKS.map((c) => c.id)).toContain("brain-saved-files"));
  it("reads build fingerprint from entry script", () => {
    const doc = { querySelectorAll: () => [{ getAttribute: () => "/assets/index-XYZ.js" }] } as unknown as Document;
    expect(currentBuildVersion(doc)).toBe("index-XYZ.js");
  });
});
