import { describe, expect, it, vi } from "vitest";
import { managerRealtimeInstructions, managerRealtimeSessionBody, refreshManagerVoiceContextWith, createManagerRealtimeSessionWith, VOICE_TOTAL_MAX_BYTES, boundUtf8, utf8Bytes } from "./manager-realtime.functions";
import { routeSkills } from "./office-skills";

// High-byte data: 2-, 3- and 4-byte UTF-8 code points, multi-line with blank lines.
const officeHuge = "Work Board:\n\nTask one\n\n".concat("é中😀\n\n".repeat(20_000));
const MEMORY_MARK = "DURABLE-MEMORY-MARKER-Goal-Zeta";
const memoryHuge = `Active memory (1):\n${MEMORY_MARK}\n\n`.concat("😀".repeat(20_000));
const team = Array.from({ length: 30 }, (_, i) => ({ name: `Ü😀名${i}`.repeat(5), role: "Opérations 中", room: "Work Board" }));
const OWNER = { ok: true as const, userId: "o", email: "o@x", aal: "aal2" as const };
const mandatory = ["submit_office_request", "approval id", "English", "interrupts", "protected actions", routeSkills("").instructions];
const total = (instr: string, mode: "relay" | "direct") => utf8Bytes(instr) + utf8Bytes(JSON.stringify(managerRealtimeSessionBody("m", "", mode).session.tools));
const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function check(instr: string, mode: "relay" | "direct") {
  expect(total(instr, mode)).toBeLessThanOrEqual(VOICE_TOTAL_MAX_BYTES);
  for (const m of mandatory) expect(instr).toContain(m);
  expect(instr).toContain(MEMORY_MARK);
  expect(instr).toContain("Task one");
  expect(instr).toContain("call submit_office_request for the full current records");
  expect(instr).not.toMatch(loneSurrogate);
}

describe("live voice instructions stay within a UTF-8 byte budget", () => {
  for (const mode of ["relay", "direct"] as const) {
    it(`startup ${mode}: high-byte office, memory and roster are bounded; memory kept`, async () => {
      let sent = "";
      const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => { sent = JSON.parse(String(init?.body)).session.instructions; return new Response(JSON.stringify({ value: "ek" })); });
      const r = await createManagerRealtimeSessionWith({ verifyOwner: async () => OWNER, reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 1 }), settle: async () => undefined, buildContext: async () => ({ ok: true, text: officeHuge }), readContinuity: async () => ({ ok: true, text: memoryHuge, counts: { memory: 1, summaries: 0, recent: 0 } }), fetchImpl: fetchImpl as typeof fetch, openaiKey: "k", realtimeModel: "gpt-realtime" }, "t", team, mode);
      expect(r.ok).toBe(true);
      check(sent, mode);
    });
    it(`refresh ${mode}: same bounds and memory kept`, async () => {
      const r = await refreshManagerVoiceContextWith({ verifyOwner: async () => OWNER, buildContext: async () => ({ ok: true, text: officeHuge }), readContinuity: async () => ({ ok: true, text: memoryHuge, counts: { memory: 1, summaries: 0, recent: 0 } }) }, "t", team, mode);
      expect(r.ok).toBe(true);
      if (r.ok) check(r.instructions, mode);
    });
    it(`small multi-line ${mode}: office with blank lines stays office, memory stays memory`, () => {
      const s = managerRealtimeInstructions("Work Board:\n\none task\n\nApprovals: none", [], mode, `Memory: ${MEMORY_MARK}`);
      const officeAt = s.indexOf("OFFICE RECORDS:"), memAt = s.indexOf("DURABLE MEMORY:");
      expect(s.indexOf("Approvals: none")).toBeGreaterThan(officeAt);
      expect(s.indexOf("Approvals: none")).toBeLessThan(memAt);
      expect(s.indexOf(MEMORY_MARK)).toBeGreaterThan(memAt);
      expect(s).not.toContain("more bytes not shown");
    });
  }
  it("boundUtf8 counts bytes and never splits a code point", () => {
    expect(boundUtf8("😀😀😀", 9)).toEqual({ text: "😀😀", omittedBytes: 4 });
    expect(boundUtf8("é", 1)).toEqual({ text: "", omittedBytes: 2 });
  });
  it("tells both voice modes to route explicit email checks without widening inbox access", () => {
    for (const mode of ["relay", "direct"] as const) {
      const instructions = managerRealtimeInstructions("office", [], mode, "memory");
      expect(instructions).toContain("explicit short request to check email or both mailboxes");
      expect(instructions).toContain("bounded billing/renewal/service-sender check");
      expect(instructions).toContain("A status question does not start a check");
      expect(total(instructions, mode)).toBeLessThanOrEqual(VOICE_TOTAL_MAX_BYTES);
    }
  });
});
