import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { managerRealtimeInstructions, managerRealtimeSessionBody, voiceSessionSkillGuidance } from "./manager-realtime.functions";
import { OFFICE_SKILLS, SKILLS_REGISTRY_VERSION, routeSkills } from "./office-skills";

describe("live voice receives canonical Office Skills guidance", () => {
  for (const mode of ["relay", "direct"] as const) {
    it(`${mode} session instructions embed the canonical core skills from the registry`, () => {
      const text = managerRealtimeInstructions("CTX", [], mode);
      expect(text).toContain(routeSkills("").instructions);
      expect(text).toContain(`registry ${SKILLS_REGISTRY_VERSION}`);
      expect(text).toContain("office-manager.skill-router");
      expect(text).toContain("approvals.owner-decision-filter");
      expect(text).toMatch(/grant NO new tools or permissions/);
    });

    it(`${mode} session tools are unchanged by skill guidance (no extra permissions)`, () => {
      const names = managerRealtimeSessionBody("gpt-realtime", managerRealtimeInstructions("CTX", [], mode), mode)
        .session.tools.map((t) => t.name);
      expect(names).toEqual(mode === "direct" ? ["submit_office_request", "check_codex_builds"] : ["submit_office_request"]);
    });
  }

  it("never loads outline, draft, reserved or legacy skills into voice", () => {
    const guidance = voiceSessionSkillGuidance();
    for (const s of OFFICE_SKILLS.filter((x) => x.kind !== "core")) expect(guidance).not.toContain(`id ${s.id})`);
  });

  it("task skills are routed per turn on the server path voice tool calls use", () => {
    const src = readFileSync("src/lib/manager.functions.ts", "utf8");
    expect(src).toMatch(/routeSkills\(latestUser\)/);
    const om = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(om).toMatch(/useRealtimeManager\([\s\S]{0,600}sendChat\(/);
    expect(routeSkills("review my subscriptions").skills.map((s) => s.id)).toContain("finance.subscription-review");
  });
});
