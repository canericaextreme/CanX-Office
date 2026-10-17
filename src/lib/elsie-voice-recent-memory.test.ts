import { describe, it, expect } from "vitest";
import { astraContinuityContext, rpcContext } from "./astra-continuity";
import { managerRealtimeInstructions } from "./manager-realtime.functions";

// Shape of the live records on 17 Oct 2026: 13 active memories (~10.7KB)
// and 40 recent rows. Voice keeps only a small byte slice of memory.
const memory = Array.from({ length: 13 }, (_, i) => ({ category: "goal", title: `Memory ${i}`, content: "saved goal text ".repeat(48), priority: 5, active: true, source: "john" }));
const recentNewestFirst = Array.from({ length: 40 }, (_, i) => ({
  role: i % 2 ? "user" : "assistant",
  content: `TURN-${40 - i} Analytics talk`,
  created_at: new Date(Date.UTC(2026, 9, 17, 2, 40) - i * 10_000).toISOString(),
}));
const summaries = [{ summary: "SUMMARY-MARK", updated_at: "2026-10-17T02:40:01Z" }];

describe("live voice reconnect keeps the last few minutes", () => {
  it("the old memory-first layout loses every recent turn inside the voice budget (the bug)", () => {
    const ins = managerRealtimeInstructions("OFFICE ".repeat(6000), [], "direct", astraContinuityContext(memory, summaries, recentNewestFirst));
    expect(ins).not.toContain("TURN-40");
  });

  it("the voice layout puts the newest turns first so they survive the cut", () => {
    const ins = managerRealtimeInstructions("OFFICE ".repeat(6000), [], "direct", astraContinuityContext(memory, summaries, recentNewestFirst, { recentFirst: true }));
    expect(ins).toContain("TURN-40 Analytics talk");
    expect(ins).toContain("TURN-39 Analytics talk");
    expect(ins.indexOf("TURN-40")).toBeLessThan(ins.indexOf("TURN-39"));
    expect(ins).toContain("NEWEST first");
  });

  it("the database function path honours the same layout", () => {
    const read = rpcContext({ memory, summaries, recent: [...recentNewestFirst].reverse() }, { recentFirst: true });
    expect(read?.ok).toBe(true);
    const text = read?.text ?? "";
    expect(text.indexOf("TURN-40")).toBeLessThan(text.indexOf("Memory 0"));
  });

  it("typed Elsie keeps the original oldest-first layout", () => {
    const text = astraContinuityContext(memory, summaries, recentNewestFirst);
    expect(text.indexOf("Memory 0")).toBeLessThan(text.indexOf("TURN-21"));
    expect(text.indexOf("TURN-21")).toBeLessThan(text.indexOf("TURN-40"));
  });

  it("direct voice sends recall, room order and Synopsis questions to the Office server", () => {
    const ins = managerRealtimeInstructions("", [], "direct", "");
    expect(ins).toContain("Also call submit_office_request for recall");
    expect(ins).toContain("never say you have no memory without asking it first");
  });
});
