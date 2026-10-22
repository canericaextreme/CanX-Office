import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => { vi.stubEnv("CANX_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("CANX_SUPABASE_PUBLISHABLE_KEY", "test-key"); });
afterEach(() => vi.unstubAllEnvs());

function chatDeps(toolName: string | null, overrides: Partial<ManagerDeps> = {}, toolArgs: Record<string, unknown> = {}) {
  const runBuild = vi.fn().mockResolvedValue({ ok: true, detail: "Accepted", runs: [{ id: 7, state: "queued", title: "b", url: "u" }] });
  let receiptTask: Record<string, unknown> | null = null;
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/manager_tasks")) {
      if (init?.method === "POST") receiptTask = { ...JSON.parse(String(init.body)), evidence: "", status: "open", updated_at: "initial" };
      if (init?.method === "PATCH") receiptTask = { ...receiptTask, ...JSON.parse(String(init.body)) };
      return Response.json(receiptTask ? [receiptTask] : []);
    }
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
    expect(builderChoiceFor("Codex ONLY: build the Analytics room. Claude may review.")).toEqual({ builder: "codex", named: true });
    expect(builderChoiceFor("Only Claude: fix the label; Codex is busy")).toEqual({ builder: "claude", named: true });
    expect(builderChoiceFor("Codex only or Claude only, fix it")).toEqual({ conflict: true });
    expect(directBuildRefusal("Codex only: build the Analytics room. Claude may review.", "claude")).toMatch(/chose Codex/);
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
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith("claude", "t", expect.stringContaining("Claude, fix the reception label"), undefined, undefined);
  });
  it("keeps Codex the default and rejects a silent model switch to Claude", async () => {
    const h = chatDeps("start_claude_build");
    const reply = await runManagerChatWith(h.deps, say("Fix the reception label"));
    expect(h.runBuild).not.toHaveBeenCalled();
    expect(reply.actionResults[0]).toMatchObject({ name: "start_claude_build", status: "stopped" });
    const c = chatDeps("start_codex_build");
    await runManagerChatWith(c.deps, say("Fix the reception label"));
    expect(c.runBuild).toHaveBeenCalledExactlyOnceWith("codex", "t", expect.stringContaining("Fix the reception label"), undefined, undefined);
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
  it.each(["execute_task", "create_task", "edit_task", "submit_task_correction"])("blocks a model's %s action during read-only or hypothetical discussion", async name => {
    const args = name === "execute_task" ? { task_id: id } : { title: "Fix the reception label", detail: "Change the room label", code_change: true, risk: "green" };
    for (const content of ["Read-only: tell me how to fix the reception label", "How would you execute the saved task?"]) {
      const h = chatDeps(name, {}, args);
      const reply = await runManagerChatWith(h.deps, say(content));
      expect(h.runBuild).not.toHaveBeenCalled();
      expect(reply.actionResults[0]).toMatchObject({ name, status: "stopped" });
      expect(vi.mocked(h.fetchImpl).mock.calls.some(([url]) => String(url).includes("/rest/v1/"))).toBe(false);
    }
  });
  it.each(["edit_task", "submit_task_correction"])("requires current owner intent for %s rather than trusting model arguments", async name => {
    const h = chatDeps(name, {}, { task_id: id, detail: "Replace requirements", correction: "Change page label" });
    const reply = await runManagerChatWith(h.deps, say("Tell me about the Office"));
    expect(reply.actionResults[0]).toMatchObject({ name, status: "stopped" });
    expect(h.runBuild).not.toHaveBeenCalled();
    expect(vi.mocked(h.fetchImpl).mock.calls.some(([url]) => String(url).includes("/rest/v1/"))).toBe(false);
  });
  it("allows only one build attempt even when the provider calls both builders", async () => {
    const h = chatDeps(null);
    const original = vi.mocked(h.fetchImpl).getMockImplementation()!;
    vi.mocked(h.fetchImpl).mockImplementation(async (input, init) => String(input).includes("/v1/responses") ? Response.json({output:[{type:"function_call",name:"start_claude_build",arguments:"{}"},{type:"function_call",name:"start_codex_build",arguments:"{}"}]}) : original(input, init));
    await runManagerChatWith(h.deps, say("Claude, fix the reception label"));
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith("claude", "t", expect.stringContaining("Claude, fix the reception label"), undefined, undefined);
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

 describe('current builder-draft-first owner rule', () => {
  const instruction = 'Pass this to the builder: apply cream-colored writing for all of the text in the Research room.';
  it('accepts the exact recorded cream-writing handoff without changing its scope', async () => {
    expect(directBuildRefusal(instruction, 'codex')).toBeNull();
    const h = chatDeps('start_codex_build');
    await runManagerChatWith(h.deps, say(instruction));
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith('codex', 't', expect.stringContaining(instruction), undefined, undefined);
  });
  it.each(['codex', 'claude'] as const)('routes an explicit %s request when the model wrongly repeats the withdrawn preview blocker', async builder => {
    const text = builder === 'claude' ? 'Claude, apply cream writing to the Research room' : instruction;
    const h = chatDeps(null);
    const original = vi.mocked(h.fetchImpl).getMockImplementation()!;
    vi.mocked(h.fetchImpl).mockImplementation(async (input, init) => String(input).includes('/v1/responses') ? Response.json({ output_text: 'I cannot submit without an outside-GitHub preview.' }) : original(input, init));
    const r = await runManagerChatWith(h.deps, say(text));
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith(builder, 't', expect.stringContaining(text), undefined, undefined);
    expect(r.text).toContain('Accepted'); expect(r.text).toContain('queued');
    expect(r.text).not.toContain('cannot submit');
  });
  it.each(['What is happening with the cream writing?', 'Do not apply cream writing to the room yet.', 'How would you apply cream writing?', 'For example, change the room text', 'Change the room text and email a vendor', 'Claude or Codex, change room text'])('does not turn discussion, protected scope or ambiguity into a submission: %s', async text => {
    const h = chatDeps(null);
    await runManagerChatWith(h.deps, say(text));
    expect(h.runBuild).not.toHaveBeenCalled();
  });
  it('never restarts an old instruction from history on a conversational follow-up', async () => {
    const h = chatDeps(null);
    await runManagerChatWith(h.deps, { accessToken: 't', messages: [{ role: 'user', content: instruction }, { role: 'assistant', content: 'Recorded' }, { role: 'user', content: 'Good morning' }] });
    expect(h.runBuild).not.toHaveBeenCalled();
  });
  it('checks the same saved run when the same owner scope arrives twice', async () => {
    const h = chatDeps('start_codex_build');
    await runManagerChatWith(h.deps, say(instruction));
    await runManagerChatWith(h.deps, say(instruction));
    expect(h.runBuild).toHaveBeenCalledTimes(2);
    expect(h.runBuild.mock.calls[1]).toEqual(['codex', 't', undefined, undefined, 7]);
  });
  it('includes the actual current room in a spoken this-room request', async () => {
    const h = chatDeps('start_codex_build');
    await runManagerChatWith(h.deps, { ...say('Apply cream writing in this room'), currentRoute: '/research' });
    expect(h.runBuild).toHaveBeenCalledExactlyOnceWith('codex', 't', expect.stringContaining('(/research)'), undefined, undefined);
  });
  it('reports an uncertain result once without a second submission', async () => {
    const h = chatDeps('start_codex_build'); h.runBuild.mockResolvedValue({ ok: false, detail: 'Timed out; submission unconfirmed. Do not retry.' });
    const r = await runManagerChatWith(h.deps, say(instruction));
    expect(h.runBuild).toHaveBeenCalledOnce();
    expect(r.actionResults[0]?.status).toBe('stopped');
    expect(r.text).toContain('unconfirmed');
  });
});

describe('Elsie Finance handoff to Claude', () => {
  const ask = 'Elsie, pass this task to Claude: organize the Finance room cards into clearer groups';
  const args = { title: 'Organize the Finance room cards', detail: 'Group the Finance room cards into clearer sections. Layout only.', project: 'CanX Office', worker: 'Claude', risk: 'green', code_change: true };
  it('sends the task to Claude straight away when Claude is idle, with a run receipt saved on the task', async () => {
    const h = chatDeps('create_task', {}, args);
    const original = vi.mocked(h.fetchImpl).getMockImplementation()!;
    // The stub database assigns the row id on insert, as Supabase does.
    vi.mocked(h.fetchImpl).mockImplementation(async (input, init) => String(input).includes('/rest/v1/manager_tasks') && init?.method === 'POST'
      ? original(input, { ...init, body: JSON.stringify({ ...JSON.parse(String(init.body)), id: '22222222-2222-4222-8222-222222222222' }) }) : original(input, init));
    h.runBuild.mockImplementation(async (_b: string, _t: string, request?: string) => request === undefined
      ? { ok: true, detail: 'status', runs: [{ id: 6, state: 'success', title: 'old', url: 'u' }] }
      : { ok: true, detail: 'GitHub accepted the Claude build request.', runs: [{ id: 7, state: 'queued', title: 'b', url: 'https://github.com/x/actions/runs/7' }] });
    const r = await runManagerChatWith(h.deps, say(ask));
    const sends = h.runBuild.mock.calls.filter(c => c[2] !== undefined);
    expect(sends).toHaveLength(1);
    expect(sends[0]![0]).toBe('claude');
    expect(sends[0]![2]).toContain('Organize the Finance room cards');
    expect(r.text).toContain('Run 7');
  });
  it('queues instead of interrupting or duplicating a running Claude build', async () => {
    const h = chatDeps('create_task', {}, args);
    h.runBuild.mockResolvedValue({ ok: true, detail: 'status', runs: [{ id: 6, state: 'in_progress', title: 'current', url: 'u' }] });
    const r = await runManagerChatWith(h.deps, say(ask));
    expect(h.runBuild.mock.calls.filter(c => c[2] !== undefined)).toHaveLength(0);
    expect(r.text).toMatch(/Queued for Claude at position 1/);
    expect(r.text).toMatch(/starts automatically/);
  });
  it('reports queue progress at the start of the next turn and never on a read-only turn', async () => {
    const advanceBuilderQueue = vi.fn(async (builder: 'claude' | 'codex') => builder === 'claude'
      ? { builder, checked: true, finished: ['"Organize the Finance room cards" finished: success.'], started: { taskId: 'x', title: 'Tidy Finance headings', ok: true, detail: 'GitHub accepted the Claude build request. Run 8: u' }, detail: 'Started queued Claude task "Tidy Finance headings".' }
      : { builder, checked: false, finished: [], detail: 'No Codex queue work.' });
    const h = chatDeps(null, { advanceBuilderQueue });
    const original = vi.mocked(h.fetchImpl).getMockImplementation()!;
    vi.mocked(h.fetchImpl).mockImplementation(async (input, init) => String(input).includes('/v1/responses') ? Response.json({ output_text: 'Good morning John.' }) : original(input, init));
    const r = await runManagerChatWith(h.deps, say('Good morning Elsie'));
    expect(advanceBuilderQueue).toHaveBeenCalledTimes(2);
    expect(r.text).toContain('finished: success');
    expect(r.text).toContain('Run 8');
    expect(r.actionResults?.[0]?.name).toBe('advance_claude_queue');
    // Live 16 Oct: the Work Board was read before the queue step, so Elsie saw the
    // finished task as still in progress. The queue step must run first.
    const order: string[] = [];
    const ordered = chatDeps(null, { advanceBuilderQueue: async (builder: 'claude' | 'codex') => { order.push('queue'); return { builder, checked: false, finished: [] as string[], detail: '' }; } });
    const readBoard = ordered.deps.buildContext;
    ordered.deps.buildContext = async (...a: Parameters<typeof readBoard>) => { order.push('board'); return readBoard(...a); };
    await runManagerChatWith(ordered.deps, say('Good morning Elsie'));
    expect(order).toEqual(['queue', 'queue', 'board']);
    advanceBuilderQueue.mockClear();
    await runManagerChatWith(h.deps, say('Just checking, do not send anything yet'));
    expect(advanceBuilderQueue).not.toHaveBeenCalled();
  });
});

describe('Elsie explains a handoff the safety check stopped', () => {
  it('names the protected wording instead of staying silent (live case 16 Oct)', async () => {
    const h = chatDeps('create_task', {}, { title: 'Organize Finance room cards into clearer sections', detail: 'Update the Finance room card layout. No financial records, payments, subscriptions, or renewals are to be changed.', project: 'CanX Office', risk: 'green', code_change: true });
    const r = await runManagerChatWith(h.deps, say('Elsie, pass this task to Claude: organize the Finance room cards into clearer sections'));
    expect(h.runBuild.mock.calls.filter(c => c[2] !== undefined)).toHaveLength(0);
    expect(r.text).toMatch(/not sent to Claude: .*protected area \(purchase\)/);
  });
});
