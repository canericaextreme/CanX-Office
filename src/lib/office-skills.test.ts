import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MASTER_NAMED_SKILLS, OFFICE_SKILLS, ROOM_SKILL_MAP, routeSkills, skillsForRoute, UNMATCHED_MASTER_ENTRIES,
} from "./office-skills";
import { OFFICE_MAP_ROOMS } from "./office-map";

const CORE_ORDER = [
  "Office Manager — Daily Office Review", "Office Manager — Skill Router", "Approvals — Owner Decision Filter",
  "Finance — Subscription Review", "Research — Source Check", "Security — Incident Triage",
  "Operations — Project Health Review", "Safe Highways — Defect Report Review", "Brain — Retrieve Decision History",
];

describe("Office Skills registry", () => {
  it("covers all 19 actual rooms with an explicit mapping or declared gap", () => {
    expect(OFFICE_MAP_ROOMS).toHaveLength(19);
    for (const r of OFFICE_MAP_ROOMS) {
      const m = ROOM_SKILL_MAP[r.route];
      expect(m, r.route).toBeDefined();
      if (m!.coverage === "mapped") expect(skillsForRoute(r.route).length, r.route).toBeGreaterThan(0);
    }
    expect(Object.keys(ROOM_SKILL_MAP).sort()).toEqual(OFFICE_MAP_ROOMS.map((r) => r.route).sort());
    expect(ROOM_SKILL_MAP["/future"]!.coverage).toBe("reserved");
    expect(UNMATCHED_MASTER_ENTRIES.length).toBeGreaterThan(0);
  });

  it("retains every master named skill", () => {
    const names = OFFICE_SKILLS.map((s) => s.name);
    for (const n of MASTER_NAMED_SKILLS) expect(names.some((x) => x.endsWith(`— ${n}`)), n).toBe(true);
    expect(MASTER_NAMED_SKILLS.length).toBeGreaterThanOrEqual(64);
  });

  it("installs the core in master build order with full fields; nothing claims live testing", () => {
    const core = OFFICE_SKILLS.filter((s) => s.kind === "core").sort((a, b) => a.buildOrder! - b.buildOrder!);
    expect(core.map((s) => s.name)).toEqual(CORE_ORDER);
    for (const s of core) {
      expect(s.instructionReady).toBe(true);
      expect(s.steps.length && s.output.length && s.inputs.length && s.guardrails.length).toBeTruthy();
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.provenance).toMatch(/CanX_Office_Skills_Map/);
    }
    for (const s of OFFICE_SKILLS) expect(s.liveTested).toBe(false);
    for (const s of OFFICE_SKILLS.filter((x) => x.kind !== "core")) expect(s.instructionReady).toBe(false);
  });

  it("source lives in the repository, not a ChatGPT Skill Library", () => {
    const src = readFileSync("src/lib/office-skills.ts", "utf8");
    expect(src).not.toMatch(/fetch\(|import\(/);
    expect(src).toMatch(/never in the ChatGPT Skill Library at runtime/);
  });
});

describe("deterministic skill router", () => {
  it("always loads router + owner decision filter, nothing else for chatter", () => {
    const r = routeSkills("hello Elsie");
    expect(r.skills.map((s) => s.id)).toEqual(["office-manager.skill-router", "approvals.owner-decision-filter"]);
  });
  it("loads the intended task skill and no unrelated instructions", () => {
    const r = routeSkills("Can you do a subscription review of OpenAI?");
    expect(r.skills.map((s) => s.id)).toContain("finance.subscription-review");
    expect(r.instructions).not.toMatch(/Defect Report Review|Incident Triage/);
    expect(r.instructions).toMatch(/grant NO new tools or permissions/);
  });
  it("daily review only on explicit request; source check admits no search tool", () => {
    expect(routeSkills("status?").skills.some((s) => s.id === "office-manager.daily-review")).toBe(false);
    expect(routeSkills("run the daily review").skills.some((s) => s.id === "office-manager.daily-review")).toBe(true);
    expect(routeSkills("source check this claim").instructions).toMatch(/NO live web\/research search tool/);
  });
  it("never loads outlines/drafts and contains no record data", () => {
    const r = routeSkills("legal privacy check, capture idea, renewal check, daily review, security incident, blockers");
    for (const s of r.skills) expect(OFFICE_SKILLS.find((x) => x.id === s.id)!.kind).toBe("core");
    expect(r.skills.length).toBeLessThanOrEqual(5);
    expect(r.instructions).not.toMatch(/receipt total|@gmail\.com/i);
  });
});
