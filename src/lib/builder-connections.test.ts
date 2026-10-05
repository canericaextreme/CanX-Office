import { describe, expect, it, vi } from "vitest";
import { runManagerChatWith, sanitizeToolArgs, type ManagerDeps } from "./manager.functions";
import { builderChoiceFor, directBuildRefusal, taskExecutionRefusal } from "./builder-choice";
import { isClaudeStatusCommand } from "./codex-status-command";
import { executeTaskWith, readExecution, type TaskExecutionDeps } from "./task-execution.server";
import { taskExecutionEvidence } from "./task-execution-evidence";
import type { ManagerTask, WorkbenchDeps } from "./manager-work.functions";
import { DENY_MESSAGES, type OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "u1", email: "owner@example.com", aal: "aal2" };
const DENIED: OwnerVerification = { ok: false, reason: "mfa_required", message: DENY_MESSAGES["mfa_required"] };
const noFetch = vi.fn(() => { throw new Error("no paid call expected"); }) as unknown as typeof fetch;

function chatDeps(toolName: string | null, overrides: Partial<ManagerDeps> = {}, toolArgs: Record<string, unknown> = {}) {
  const runBuild = vi.fn().mockResolvedValue({ ok: true, detail: "Accepted", runs: [{ id: 7, state: "queued", title: "b", url: "u" }] });
  const fetchImpl = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v1/models/")) return Response.json({});
    if (url.includes("/v1/responses")) return Response.json({ output: toolName ? [{ type: "function_call", name: toolName, arguments: JSON.stringify(toolArgs) }] : [] });
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
  it.each(["The Claude build failed.", "Check Claude build status", "Tell me whether Claude can fix the page", "Read-only: fix the reception label", "Do not execute the task", "How would you fix the reception label?"])("does not treat a build mention or discussion as permission: %s", text => {
    const choice = builderChoiceFor(text);
    expect(directBuildRefusal(text, "conflict" in choice ? "codex" : choice.builder)).not.toBeNull();
  });
  it("accepts an explicit polite change and a saved-task instruction", () => {
    expect(directBuildRefusal("Can you fix the reception label?", "codex")).toBeNull();
    expect(taskExecutionRefusal("Claude, execute the saved task 123")).toBeNull();
    expect(taskExecutionRefusal("How would you execute the saved task 123?")).not.toBeNull();
    expect(taskExecutionRefusal("Check the task execution status")).not.toBeNull();
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
  it.each(["Check Claude build status", "Please check Claude build status. Do not start a build."])("routes natural status read-only before a paid call: %s", async content => {
    const checkClaudeStatus = vi.fn().mockResolvedValue({ ok: true, detail: "Status only", runs: [] });
    const h = chatDeps("start_claude_build", { checkClaudeStatus });
    await runManagerChatWith(h.deps, say(content));
    expect(checkClaudeStatus).toHaveBeenCalledOnce();
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(h.runBuild).not.toHaveBeenCalled();
  });
  it.each(["execute_task", "create_task"])("blocks a model's %s action during read-only or hypothetical discussion", async name => {
    const args = name === "execute_task" ? { task_id: id } : { title: "Fix the reception label", detail: "Change the room label", code_change: true, risk: "green" };
    for (const content of ["Read-only: tell me how to fix the reception label", "How would you execute the saved task?"]) {
      const h = chatDeps(name, {}, args);
      const reply = await runManagerChatWith(h.deps, say(content));
      expect(h.runBuild).not.toHaveBeenCalled();
      expect(reply.actionResults[0]).toMatchObject({ name, status: "stopped" });
      expect(vi.mocked(h.fetchImpl).mock.calls.some(([url]) => String(url).includes("/rest/v1/"))).toBe(false);
    }
  });
  it("allows only one build attempt even when the provider calls both builders", async () => {
    const h = chatDeps(null);
    vi.mocked(h.fetchImpl).mockImplementation(async input => String(input).includes("/v1/models/") ? Response.json({}) : Response.json({output:[{type:"function_call",name:"start_claude_build",arguments:"{}"},{type:"function_call",name:"start_codex_build",arguments:"{}"}]}));
    await runManagerChatWith(h.deps, say("Claude, fix the reception label"));
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith("claude", "t", "Claude, fix the reception label", undefined);
  });
});

const id = "11111111-1111-4111-8111-111111111111";
function taskSetup(evidence = "") {
  let task: ManagerTask = { id, owner_id: "owner", title: "Change the room label", detail: "Use a clearer label on the reception page.", project: "CanX Office", status: "open", risk: "green", worker: "", result: "", evidence, created_at: "x", updated_at: "x" };
  const rest = vi.fn(async (_t: string, method: string, path: string, body?: Record<string, unknown>) => {
    if (method === "GET") return { ok: true, data: [{ ...task }] };
    if (method === "PATCH" && !path.includes(`evidence=eq.${encodeURIComponent(task.evidence)}&`)) return { ok: true, data: [] };
    if (method === "PATCH") { task = { ...task, ...body } as ManagerTask; return { ok: true, data: [{ ...task }] }; }
    return { ok: true, data: [] };
  });
  const build = vi.fn().mockResolvedValue({ ok: true, detail: "Codex", runs: [{ id: 42, state: "queued", title: "", url: "" }] });
  const buildClaude = vi.fn().mockResolvedValue({ ok: true, detail: "Claude", runs: [{ id: 99, state: "queued", title: "", url: "" }] });
  const deps: TaskExecutionDeps = { workbench: { verifyOwner: vi.fn().mockResolvedValue({ ok: true, userId: "owner" }), rest } as unknown as WorkbenchDeps, build, buildClaude };
  return { deps, build, buildClaude, rest, task: () => task };
}

describe("task execution with recorded builder", () => {
  it("does not treat an unreadable prior builder receipt as permission to retry", async () => {
    const h = taskSetup(JSON.stringify({kind:"office-task-v2",builder:"unknown",attempt:"a",state:"submission_unconfirmed"}));
    expect((await executeTaskWith(h.deps, "t", id)).ok).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
    expect(h.buildClaude).not.toHaveBeenCalled();
  });
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
