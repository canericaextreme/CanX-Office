import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MASTER_NAMED_SKILLS, OFFICE_SKILLS, ROOM_SKILL_MAP, routeSkills, routeSkillsForRoom, skillsForRoute, UNMATCHED_MASTER_ENTRIES,
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
    const named = OFFICE_SKILLS.filter((s) => s.kind === "outline" || s.kind === "draft");
    expect(named.length).toBeGreaterThanOrEqual(60);
    for (const s of named) {
      expect(s.instructionReady, s.id).toBe(true);
      expect(s.routingTested, s.id).toBe(true);
      expect(s.steps.length, s.id).toBeGreaterThanOrEqual(5);
      expect(s.output.length, s.id).toBeGreaterThanOrEqual(5);
      expect(s.provenance, s.id).toMatch(/John|master map/i);
    }
    for (const s of OFFICE_SKILLS.filter((x) => x.kind === "reserved" || x.kind === "legacy")) expect(s.instructionReady).toBe(false);
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
  it("routes every installed job specifically and excludes it from unrelated chatter", () => {
    const installed = OFFICE_SKILLS.filter((s) => s.instructionReady && !["office-manager.skill-router", "approvals.owner-decision-filter"].includes(s.id));
    for (const skill of installed) {
      const job = skill.name.split(" — ").at(-1) ?? skill.name;
      expect(routeSkills(`Please run ${job}`).skills.map((s) => s.id), skill.id).toContain(skill.id);
      expect(routeSkills("hello Elsie, how are you?").skills.map((s) => s.id), skill.id).not.toContain(skill.id);
    }
  });
  it("prioritizes exact request matches, caps task instructions at three, and discloses omitted broad-review skills", () => {
    const exact = routeSkillsForRoom("receipt reconciliation", "/finance");
    expect(exact.skills.map((s) => s.id)).toContain("finance.receipt-reconciliation");
    expect(exact.skills.map((s) => s.id)).not.toContain("finance.budget-variance-review");
    const broad = routeSkillsForRoom("review this room", "/subscriptions");
    expect(broad.skills).toHaveLength(5);
    expect(broad.omitted.length).toBeGreaterThan(0);
    expect(broad.instructions).toMatch(/Bounded selection disclosure/);
  });
  it("routes every Subscriptions job and other room jobs", () => {
    const cases: Array<[string, string]> = [
      ["renewal check", "subscriptions.renewal-check"], ["plan change review", "subscriptions.plan-change-review"],
      ["tool value review", "subscriptions.tool-value-review"], ["vendor dependency check", "subscriptions.vendor-dependency-check"],
      ["renewal watch", "finance.renewal-watch"], ["receipt reconciliation", "finance.receipt-reconciliation"],
      ["budget variance review", "finance.budget-variance-review"],
    ];
    for (const [request, id] of cases) {
      const selected = routeSkillsForRoom(request, "/subscriptions").skills.map((s) => s.id);
      expect(selected, request).toContain(id);
    }
    expect(routeSkillsForRoom("legal issue spotter", "/legal").skills.map((s) => s.id)).toContain("legal.legal-issue-spotter");
  });
  it("does not route reserved/history entries and contains no record data", () => {
    const r = routeSkills("future reserved phase 0 planning stripe integration");
    expect(r.skills).toHaveLength(2);
    expect(r.instructions).not.toMatch(/receipt total|@gmail\.com/i);
  });
});

import { dailyLoop, skillReadiness, INSTRUCTION_GAPS, EXECUTABLE_ACTIONS, OFFICE_SKILLS as ALL } from "./office-skills";
describe("readiness levels and review loop", () => {
  it("runs the saved loop in order and never claims live tests", () => {
    const loop = dailyLoop();
    expect(loop.map((x) => x.skill.id)).toEqual(["office-manager.daily-review", "office-manager.skill-router", "approvals.owner-decision-filter", "finance.subscription-review", "research.source-check", "security.incident-triage"]);
    expect(loop.find((x) => x.skill.id === "research.source-check")!.readiness).toBe("blocked");
    expect(loop.find((x) => x.skill.id === "security.incident-triage")!.readiness).toBe("blocked");
    expect(ALL.every((s) => s.liveTested === false)).toBe(true);
  });
  it("only marks real actions executable and lists gaps", () => {
    for (const id of Object.keys(EXECUTABLE_ACTIONS)) expect(skillReadiness(ALL.find((s) => s.id === id)!)).toBe("executable");
    expect(INSTRUCTION_GAPS.map((g) => g.route)).toEqual(["/analytics", "/family-continuity"]);
  });
});
