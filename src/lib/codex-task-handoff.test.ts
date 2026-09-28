import { describe, expect, it, vi } from "vitest";
import { handOffTaskToCodex, shouldHandOffToCodex, type CodexHandoffGate } from "./codex-task-handoff";

const green: CodexHandoffGate = { codeChange: true, taskRisk: "green", classifiedRisk: "green", protectedCategory: null, alreadySubmitted: false };

describe("Work Board task to Codex handoff", () => {
  it("green code-change task triggers exactly one Codex handoff and stays in progress", async () => {
    expect(shouldHandOffToCodex(green)).toBe(true);
    const startBuild = vi.fn().mockResolvedValue({ ok: true, detail: "GitHub accepted the Codex build request." });
    const recordOnTask = vi.fn().mockResolvedValue(true);
    const out = await handOffTaskToCodex({ startBuild, recordOnTask }, "remove the search box at the top of the front page");
    expect(startBuild).toHaveBeenCalledTimes(1);
    expect(startBuild).toHaveBeenCalledWith("remove the search box at the top of the front page");
    expect(out.status).toBe("in_progress");
    expect(recordOnTask.mock.calls[0]![0].status).toBe("in_progress");
    expect(recordOnTask.mock.calls[0]![0].evidence).toContain("accepted");
  });
  it("green non-code task does not trigger Codex", () => {
    expect(shouldHandOffToCodex({ ...green, codeChange: false })).toBe(false);
  });
  it("yellow, red or protected work never auto-builds", () => {
    expect(shouldHandOffToCodex({ ...green, taskRisk: "yellow" })).toBe(false);
    expect(shouldHandOffToCodex({ ...green, taskRisk: "red" })).toBe(false);
    expect(shouldHandOffToCodex({ ...green, classifiedRisk: "yellow" })).toBe(false);
    expect(shouldHandOffToCodex({ ...green, classifiedRisk: "red" })).toBe(false);
    expect(shouldHandOffToCodex({ ...green, protectedCategory: "spending" })).toBe(false);
  });
  it("failed or uncertain builds are never marked done and are not retried", async () => {
    for (const startBuild of [
      vi.fn().mockResolvedValue({ ok: false, detail: "may already be running" }),
      vi.fn().mockRejectedValue(new Error("network")),
    ]) {
      const recordOnTask = vi.fn().mockResolvedValue(true);
      const out = await handOffTaskToCodex({ startBuild, recordOnTask }, "change the header");
      expect(startBuild).toHaveBeenCalledTimes(1);
      expect(out.submitted).toBe(false);
      expect(out.status).toBe("open");
      expect(recordOnTask.mock.calls[0]![0].status).not.toBe("done");
      expect(recordOnTask.mock.calls[0]![0].evidence).toContain("not confirmed");
    }
  });
  it("no duplicate build submission within one manager turn", () => {
    expect(shouldHandOffToCodex({ ...green, alreadySubmitted: true })).toBe(false);
  });
});
