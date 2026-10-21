import { describe, expect, it } from "vitest";
import { autopilotCommand, autopilotDetail, parseAutopilot, touchesLegal } from "./autopilot";
import { officeBuildProtectedCategory } from "./codex-task-handoff";
import { autopilotStepWith } from "./task-execution.server";

describe("Office autopilot switch", () => {
  it("hears John's stop and resume words", () => {
    for (const t of ["Stop everything.", "Okay, stop all work", "Elsie, pause the builds", "Stop building", "Turn off the autopilot"]) expect(autopilotCommand(t)).toBe("stopped");
    for (const t of ["Resume work", "Okay, resume the builds", "Start building again", "Turn the autopilot back on"]) expect(autopilotCommand(t)).toBe("on");
  });

  it("never flips on questions, negations or ordinary requests", () => {
    for (const t of ["Should I stop everything?", "Don't stop the builds", "Stop the music in the Reception room", "Fix the Finance heading", ""]) expect(autopilotCommand(t)).toBeNull();
  });

  it("reads line 1 of the note and treats a missing note as on", () => {
    expect(parseAutopilot(undefined).mode).toBe("on");
    const detail = autopilotDetail("stopped", "2026-10-21T15:00:00Z", "Elsie for John", "Stop | everything\nnow");
    expect(detail.split("\n")[0]).toBe('AUTOPILOT: stopped | UPDATED: 2026-10-21T15:00:00Z | BY: Elsie for John | NOTE: John said "Stop everything now"');
    expect(parseAutopilot(detail)).toMatchObject({ mode: "stopped", updated: "2026-10-21T15:00:00Z", by: "Elsie for John" });
  });
});

describe("legal gate", () => {
  it("sends legal matters to John but not edits to the Legal room screen", () => {
    expect(touchesLegal("Draft the subcontractor contract terms")).toBe(true);
    expect(touchesLegal("Update the privacy policy page")).toBe(true);
    expect(touchesLegal("Recolour the Legal room heading")).toBe(false);
    expect(officeBuildProtectedCategory("Add a lawsuit tracker card")).toBe("legal");
    expect(officeBuildProtectedCategory("Move the Finance heading up")).toBeNull();
  });
});

describe("autopilotStepWith", () => {
  const owner = { ok: true as const, userId: "owner-1" };
  const workbench = (existing: { detail: string }[], calls: { method: string; path: string; body?: Record<string, unknown> }[]) => ({
    verifyOwner: async () => owner,
    reserve: async () => ({ ok: false }) as never,
    settle: async () => undefined,
    ensureBudget: async () => ({ ok: true }),
    rest: async <T,>(_t: string, method: string, path: string, body?: Record<string, unknown>) => {
      calls.push({ method, path, ...(body ? { body } : {}) });
      return { ok: true, data: (method === "GET" ? existing : [{}]) as T };
    },
  });

  it("creates the stopped note when John says stop", async () => {
    const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
    const step = await autopilotStepWith(workbench([], calls) as never, "t", "Stop everything");
    expect(step).toMatchObject({ mode: "stopped", changed: true });
    expect(calls[1]).toMatchObject({ method: "POST", path: "office_notes" });
    expect(String(calls[1]?.body?.["detail"])).toMatch(/^AUTOPILOT: stopped \|/);
  });

  it("only reads when nothing is said about the switch", async () => {
    const calls: { method: string; path: string }[] = [];
    const step = await autopilotStepWith(workbench([{ detail: "AUTOPILOT: stopped | UPDATED: x" }], calls) as never, "t", "Check Claude builds");
    expect(step).toMatchObject({ mode: "stopped", changed: false });
    expect(calls.map(c => c.method)).toEqual(["GET"]);
  });

  it("resumes an existing stopped note in place", async () => {
    const calls: { method: string; path: string }[] = [];
    const step = await autopilotStepWith(workbench([{ detail: "AUTOPILOT: stopped" }], calls) as never, "t", "Resume work");
    expect(step).toMatchObject({ mode: "on", changed: true });
    expect(calls[1]?.method).toBe("PATCH");
  });
});
