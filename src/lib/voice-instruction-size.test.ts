import { describe, expect, it, vi } from "vitest";
import { managerRealtimeInstructions, refreshManagerVoiceContextWith, createManagerRealtimeSessionWith, VOICE_INSTRUCTIONS_MAX_CHARS, boundText } from "./manager-realtime.functions";
import { routeSkills } from "./office-skills";

const huge = "Task: ".concat("é😀x".repeat(40_000));
const OWNER = { ok: true as const, userId: "o", email: "o@x", aal: "aal2" as const };
const len = (s: string) => Array.from(s).length;
const mandatory = ["submit_office_request", "approval id", "English", "interrupts", routeSkills("").instructions];

describe("live voice instructions stay within the provider limit", () => {
  for (const mode of ["relay", "direct"] as const) {
    it(`startup ${mode}: oversized context is bounded, mandatory rules intact`, async () => {
      let sent = "";
      const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => { sent = JSON.parse(String(init?.body)).session.instructions; return new Response(JSON.stringify({ value: "ek" })); });
      const r = await createManagerRealtimeSessionWith({ verifyOwner: async () => OWNER, reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 1 }), settle: async () => undefined, buildContext: async () => ({ ok: true, text: huge }), readContinuity: async () => ({ ok: true, text: "Memory: " + huge, counts: { memory: 1, summaries: 0, recent: 0 } }), fetchImpl: fetchImpl as typeof fetch, openaiKey: "k", realtimeModel: "gpt-realtime" }, "t", [], mode);
      expect(r.ok).toBe(true);
      expect(len(sent)).toBeLessThanOrEqual(VOICE_INSTRUCTIONS_MAX_CHARS);
      for (const m of mandatory) expect(sent).toContain(m);
      expect(sent).toContain("call submit_office_request for the full current records");
      expect(sent).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    });
    it(`refresh ${mode}: oversized context is bounded`, async () => {
      const r = await refreshManagerVoiceContextWith({ verifyOwner: async () => OWNER, buildContext: async () => ({ ok: true, text: huge }), readContinuity: async () => ({ ok: true, text: huge, counts: { memory: 1, summaries: 0, recent: 0 } }) }, "t", [], mode);
      expect(r.ok && len(r.instructions)).toBeLessThanOrEqual(VOICE_INSTRUCTIONS_MAX_CHARS);
      for (const m of mandatory) expect(r.instructions).toContain(m);
    });
  }
  it("small context passes through whole", () => {
    const s = managerRealtimeInstructions("Work Board: one task.\n\nMemory: goal A", []);
    expect(s).toContain("Work Board: one task."); expect(s).toContain("Memory: goal A"); expect(s).not.toContain("more characters not shown");
  });
  it("boundText never splits an emoji", () => {
    expect(boundText("😀😀😀", 2)).toEqual({ text: "😀😀", omitted: 1 });
  });
});
