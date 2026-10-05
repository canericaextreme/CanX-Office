import { describe, expect, it, vi } from "vitest";
import { runManagerChatWith, sanitizeToolArgs, type ManagerDeps } from "./manager.functions";
import { builderChoiceFor, directBuildRefusal } from "./builder-choice";
import { isClaudeStatusCommand } from "./codex-status-command";
import { executeTaskWith, readExecution, type TaskExecutionDeps } from "./task-execution.server";
import { taskExecutionEvidence } from "./task-execution-evidence";
import type { ManagerTask, WorkbenchDeps } from "./manager-work.functions";
import { DENY_MESSAGES, type OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "u1", email: "owner@example.com", aal: "aal2" };
const DENIED: OwnerVerification = { ok: false, reason: "mfa_required", message: DENY_MESSAGES["mfa_required"] };
const noFetch = vi.fn(() => { throw new Error("no paid call expected"); }) as unknown as typeof fetch;

function chatDeps(toolName: string | null, overrides: Partial<ManagerDeps> = {}) {
  const runBuild = vi.fn().mockResolvedValue({ ok: true, detail: "Accepted", runs: [{ id: 7, state: "queued", title: "b", url: "u" }] });
  const fetchImpl = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v1/models/")) return Response.json({});
    if (url.includes("/v1/responses")) return Response.json({ output: toolName ? [{ type: "function_call", name: toolName, arguments: "{}" }] : [] });
    return Response.json({});
  }) as unknown as typeof fetch;
  const deps: ManagerDeps = {
    verifyOwner: async () => OWNER, reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 9 }),
    settle: async () => undefined, buildContext: async () => ({ ok: true, text: "CTX" }),
    fetchImpl, openaiKey: "sk-test", model: "gpt-test", runBuild, ...overrides,
  };
  return { deps, runBuild, fetchImpl };
}
const say = (content: string) => ({ accessToken: "t", messages: [{ role: "user" as const, content }] });

describe("builder choice is John's, never the model's", () => {
  it("defaults to Codex, honours a named builder and refuses both", () => {
    expect(builderChoiceFor("Fix the reception label")).toEqual({ builder: "codex", named: false });
    expect(builderChoiceFor("Have Claude fix the reception label")).toEqual({ builder: "claude", named: true });
    expect(builderChoiceFor("Claude or Codex, fix it")).toEqual({ conflict: true });
  });
  it("refuses status, questions, examples and protected work", () => {
    expect(directBuildRefusal("Check Claude builds", "claude")).toMatch(/status/);
    expect(directBuildRefusal("Could Claude fix the reception label?", "claude")).toMatch(/status/);
    expect(directBuildRefusal("For example, Claude could fix the reception label", "claude")).toMatch(/example/);
    expect(directBuildRefusal("Claude, fix the reception label and email a customer", "claude")).toMatch(/protected/);
    expect(directBuildRefusal("Claude, fix the reception label", "claude")).toBeNull();
    expect(directBuildRefusal("Fix the reception label", "claude")).toMatch(/chose Codex/);
  });
  it("validates the new tool arguments strictly", () => {
    expect(sanitizeToolArgs("start_claude_build", '{"request":"injected"}')).toEqual({});
    expect(sanitizeToolArgs("check_claude_builds", '{"change_number":5}')).toEqual({ change_number: 5 });
    expect(isClaudeStatusCommand("Check Claude builds")).toBe(true);
    expect(isClaudeStatusCommand("Explain check_claude_builds")).toBe(false);
  });
});

describe("Elsie builder routing", () => {
  it("answers a Claude status command read-only without any OpenAI call", async () => {
    const checkClaudeStatus = vi.fn().mockResolvedValue({ ok: true, detail: "Live Claude run status.", runs: [] });
    const reply = await runManagerChatWith({ verifyOwner: async () => OWNER, reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 1 }), settle: async () => undefined, buildContext: async () => ({ ok: true, text: "" }), fetchImpl: noFetch, openaiKey: "sk", model: "m", checkClaudeStatus }, say("Check Claude builds"));
    expect(checkClaudeStatus).toHaveBeenCalledOnce();
    expect(noFetch).not.toHaveBeenCalled();
    expect(reply.actionResults[0]?.name).toBe("check_claude_builds");
    expect(reply.text).toContain("No recorded Claude build runs.");
  });
  it("denies an unverified owner before any dispatch", async () => {
    const h = chatDeps("start_claude_build", { verifyOwner: async () => DENIED });
    const reply = await runManagerChatWith(h.deps, say("Claude, fix the reception label"));
    expect(reply.ok).toBe(false);
    expect(h.runBuild).not.toHaveBeenCalled();
  });
  it("sends to Claude only when John named Claude", async () => {
    const h = chatDeps("start_claude_build");
    await runManagerChatWith(h.deps, say("Claude, fix the reception label"));
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith("claude", "t", "Claude, fix the reception label", undefined);
  });
  it("keeps Codex the default and rejects a silent model switch to Claude", async () => {
    const h = chatDeps("start_claude_build");
    const reply = await runManagerChatWith(h.deps, say("Fix the reception label"));
    expect(h.runBuild).not.toHaveBeenCalled();
    expect(reply.actionResults[0]).toMatchObject({ name: "start_claude_build", status: "stopped" });
    const c = chatDeps("start_codex_build");
    await runManagerChatWith(c.deps, say("Fix the reception label"));
    expect(c.runBuild).toHaveBeenCalledExactlyOnceWith("codex", "t", "Fix the reception label", undefined);
  });
  it("never dispatches from a discussion or example", async () => {
    const h = chatDeps("start_codex_build");
    await runManagerChatWith(h.deps, say("For example, you could fix the reception label"));
    expect(h.runBuild).not.toHaveBeenCalled();
  });
});

const id = "11111111-1111-4111-8111-111111111111";
function taskSetup(evidence = "") {
  let task: ManagerTask = { id, owner_id: "owner", title: "Change the room label", detail: "Use a clearer label on the reception page.", project: "CanX Office", status: "open", risk: "green", worker: "", result: "", evidence, created_at: "x", updated_at: "x" };
  const rest = vi.fn(async (_t: string, method: string, _p: string, body?: Record<string, unknown>) => {
    if (method === "GET") return { ok: true, data: [{ ...task }] };
    if (method === "PATCH") { task = { ...task, ...body } as ManagerTask; return { ok: true, data: [{ ...task }] }; }
    return { ok: true, data: [] };
  });
  const build = vi.fn().mockResolvedValue({ ok: true, detail: "Codex", runs: [{ id: 42, state: "queued", title: "", url: "" }] });
  const buildClaude = vi.fn().mockResolvedValue({ ok: true, detail: "Claude", runs: [{ id: 99, state: "queued", title: "", url: "" }] });
  const deps: TaskExecutionDeps = { workbench: { verifyOwner: vi.fn().mockResolvedValue({ ok: true, userId: "owner" }), rest } as unknown as WorkbenchDeps, build, buildClaude };
  return { deps, build, buildClaude, rest, task: () => task };
}

describe("task execution with recorded builder", () => {
  it("persists Claude identity and checks status with Claude only", async () => {
    const h = taskSetup();
    await executeTaskWith(h.deps, "t", id, false, "claude");
    const ev = JSON.parse(h.task().evidence);
    expect(ev).toMatchObject({ kind: "office-task-v2", builder: "claude", runId: 99 });
    expect(taskExecutionEvidence(h.task().evidence)?.label).toMatch(/^Claude:/);
    await executeTaskWith(h.deps, "t", id, true);
    expect(h.buildClaude).toHaveBeenLastCalledWith("t", undefined, undefined, 99);
    expect(h.build).not.toHaveBeenCalled();
  });
  it("reads legacy codex-task-v1 as Codex and refuses a conflicting builder", async () => {
    const legacy = JSON.stringify({ kind: "codex-task-v1", attempt: "a", runId: 42, state: "queued", prior: "" });
    expect(readExecution(legacy)?.builder).toBe("codex");
    const h = taskSetup(legacy);
    expect((await executeTaskWith(h.deps, "t", id, false, "claude")).detail).toMatch(/already recorded with Codex/);
    expect((await executeTaskWith(h.deps, "t", id, true, "claude")).ok).toBe(false);
    await executeTaskWith(h.deps, "t", id, true);
    expect(h.build).toHaveBeenCalledWith("t", undefined, undefined, 42);
    expect(h.buildClaude).not.toHaveBeenCalled();
  });
  it("concurrent claims never produce two builds across builders", async () => {
    const h = taskSetup();
    await Promise.all([executeTaskWith(h.deps, "t", id, false, "codex"), executeTaskWith(h.deps, "t", id, false, "claude")]);
    expect(h.build.mock.calls.length + h.buildClaude.mock.calls.length).toBeLessThanOrEqual(1);
    await executeTaskWith(h.deps, "t", id, false, "codex");
    expect(h.build.mock.calls.length + h.buildClaude.mock.calls.length).toBe(1);
  });
  it("never retries or falls back after an uncertain dispatch", async () => {
    const h = taskSetup(); h.buildClaude.mockRejectedValueOnce(new Error("timeout"));
    await executeTaskWith(h.deps, "t", id, false, "claude");
    await executeTaskWith(h.deps, "t", id, false, "codex");
    expect(h.buildClaude).toHaveBeenCalledOnce();
    expect(h.build).not.toHaveBeenCalled();
  });
});
