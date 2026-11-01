import { describe, expect, it, vi } from "vitest";
import { continueElsieTaskWith, isElsieContinuation } from "./elsie-continuation.server";
import { runManagerChatWith } from "./manager.functions";
import type { ManagerTask, WorkbenchDeps } from "./manager-work.functions";
import { builderChoiceFor, directBuildRefusal } from "./builder-choice";
import { looksLikeOfficeCodeChange } from "./codex-task-handoff";

const now = Date.parse("2026-10-22T12:00:00Z");
function office(extra: Partial<ManagerTask>[] = [{}]) {
  const recent: { role: string; content: string; created_at: string }[] = [];
  const rows: ManagerTask[] = extra.map((t, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    owner_id: "owner", title: "Fix Office reception button spacing",
    detail: "Change the CanX Office reception button layout.", project: "CanX Office",
    status: "open", risk: "green", worker: "Codex", result: "", evidence: "",
    created_at: "2026-10-22T11:00:00Z", updated_at: "2026-10-22T11:00:00Z", ...t,
  }));
  const rest = vi.fn(async (_token: string, method: string, path: string, body?: Record<string, unknown>) => {
    if (method === "POST") return { ok: true, data: [] };
    if (path.startsWith("astra_recent_context?")) return { ok: true, data: recent.map(t => ({ ...t })) };
    const id = /[?&]id=eq.([^&]+)/.exec(path)?.[1];
    const evidence = /[?&]evidence=eq.([^&]*)/.exec(path)?.[1];
    const found = rows.filter(t => (!id || t.id === decodeURIComponent(id))
      && (evidence === undefined || t.evidence === decodeURIComponent(evidence)));
    if (method === "PATCH") found.forEach(t => Object.assign(t, body));
    return { ok: true, data: found.map(t => ({ ...t })) };
  });
  const workbench = { verifyOwner: async () => ({ ok: true, userId: "owner", aal: "aal2" }), rest } as unknown as WorkbenchDeps;
  const build = vi.fn(async (_token: string, request?: string) => ({
    ok: true, detail: request ? "Accepted run 42; no PR verified." : "Run 42 failed; no PR.",
    runs: [{ id: 42, state: request ? "queued" : "failure", url: "https://example.test/run/42", title: "draft" }],
  }));
  return { rows, recent, rest, build, deps: { workbench, build } };
}

describe("owner saved-task continuity with stub executors", () => {
  it.each(["Proceed", "proceed with that", "continue", "carry on", "finish that", "finish it", "Just continue with the task", "Okay, proceed", "then proceed", "complete the job", "resume that task"])("executes %s once through existing receipt gates", async words => {
    const o = office();
    expect((await continueElsieTaskWith(o.deps, "t", words, now)).detail).toContain("run 42");
    expect(o.build).toHaveBeenCalledTimes(1);
    // A reopened conversation has no local history; only the persisted receipt.
    const checked = await continueElsieTaskWith(o.deps, "t", "continue", now);
    expect(checked.detail).toContain("no PR");
    expect(o.build.mock.calls.filter(c => c[1] !== undefined)).toHaveLength(1);
  });
  it.each(["stop", "stop everything", "continue, but do not send", "could we continue?", "just discussing", "for example, proceed"])("does not execute discussion/stop: %s", async words => {
    const o = office();
    expect(isElsieContinuation(words)).toBe(false);
    await continueElsieTaskWith(o.deps, "t", words, now);
    expect(o.build).not.toHaveBeenCalled();
    expect(o.rest).not.toHaveBeenCalled();
  });
  it.each(([
    [{}, {}],
    [{ created_at: "2026-10-20T00:00:00Z" }],
    [{ owner_id: "another-owner" }],
    [{ status: "done" }],
    [{ risk: "red" }],
    [{ worker: "Claude" }],
    [{ evidence: "[elsie-claim codex saved]" }],
    [{ evidence: '{"kind":"office-task-v2","builder":"codex","state":"submission_unconfirmed"}' }],
  ] satisfies Partial<ManagerTask>[][]).map(rows => [rows] as const))("refuses ambiguous, stale, foreign, blocked or uncertain tasks: %j", async rows => {
    const o = office(rows);
    const result = await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(result.ok).toBe(false);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("keeps simultaneous continuation turns behind the existing compare-and-set", async () => {
    const o = office();
    await Promise.all([
      continueElsieTaskWith(o.deps, "t", "Proceed", now),
      continueElsieTaskWith(o.deps, "t", "continue", now),
    ]);
    expect(o.build.mock.calls.filter(c => c[1] !== undefined)).toHaveLength(1);
  });
  it("does not use another owner's record to create ambiguity", async () => {
    const o = office([{}, { owner_id: "other" }]);
    await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(o.build).toHaveBeenCalledTimes(1);
  });
  it("does not refresh stale authority from a recent status update", async () => {
    const o = office([{ created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-22T11:59:00Z" }]);
    await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("keeps the executor's protected-scope gate", async () => {
    const o = office([{ title: "Change Office authentication permissions", detail: "Remove the sign-in requirement." }]);
    expect((await continueElsieTaskWith(o.deps, "t", "Proceed", now)).ok).toBe(false);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("asks which task rather than choosing the latest", async () => {
    const o = office([{}, {}]);
    expect((await continueElsieTaskWith(o.deps, "t", "Proceed", now)).detail).toContain("Which task");
  });
  it("resumes the discussed task among several open jobs after reopening", async () => {
    const o = office([{}, { title: "Fix another Office panel" }]);
    o.recent.push({ role: "assistant", content: `Saved task ${o.rows[0]!.id}`, created_at: "2026-10-22T11:59:00Z" });
    await continueElsieTaskWith(o.deps, "t", "finish it", now);
    expect(o.build).toHaveBeenCalledExactlyOnceWith("t", `${o.rows[0]!.title}\n${o.rows[0]!.detail}`);
  });
  it("uses current discussion to identify the job without treating other jobs as ambiguity", async () => {
    const o = office([{}, { title: "Fix another Office panel" }]);
    await continueElsieTaskWith(o.deps, "t", "Proceed", now, [{ role: "user", content: `Work on ${o.rows[1]!.id}` }]);
    expect(o.build).toHaveBeenCalledExactlyOnceWith("t", `${o.rows[1]!.title}\n${o.rows[1]!.detail}`);
  });
  it("does not substitute a fresh job when discussion names a stale task", async () => {
    const o = office([{ created_at: "2026-10-20T00:00:00Z" }, { title: "Fix another Office panel" }]);
    o.recent.push({ role: "user", content: o.rows[0]!.id, created_at: "2026-10-22T11:59:00Z" });
    await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("does not pick between two jobs named in the same recent exchange", async () => {
    const o = office([{}, { title: "Fix another Office panel" }]);
    o.recent.push({ role: "assistant", content: o.rows.map(t => t.id).join(" and "), created_at: "2026-10-22T11:59:00Z" });
    await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("never picks a task when saved discussion could not be read", async () => {
    const o = office();
    o.rest.mockImplementationOnce(async () => ({ ok: true, data: o.rows }));
    o.rest.mockImplementationOnce(async () => ({ ok: false, data: [] }));
    await continueElsieTaskWith(o.deps, "t", "Proceed", now);
    expect(o.build).not.toHaveBeenCalled();
  });
  it("recognizes the original clear screen instruction without selecting a colleague named as a button", () => {
    const words = "separate the ChatGPT and Claude buttons by a quarter inch";
    expect(builderChoiceFor(words)).toEqual({ builder: "codex", named: false });
    expect(directBuildRefusal(words, "codex")).toBeNull();
    expect(looksLikeOfficeCodeChange(words)).toBe(true);
    expect(builderChoiceFor(`Claude, ${words}`)).toEqual({ builder: "claude", named: true });
  });
  it("routes reopen through saved owner records before any model or queue call", async () => {
    const o = office([{ created_at: new Date().toISOString() }]);
    const fetchImpl = vi.fn();
    const queue = vi.fn();
    const reply = await runManagerChatWith({
      verifyOwner: o.deps.workbench.verifyOwner, workbenchRest: o.deps.workbench.rest,
      runBuild: async (_builder, token, request) => o.build(token, request),
      advanceBuilderQueue: queue, fetchImpl, openaiKey: undefined, model: undefined,
      buildContext: vi.fn(), reserve: vi.fn(), settle: vi.fn(),
    }, { accessToken: "t", messages: [{ role: "user", content: "Proceed" }] });
    expect(reply.text).toContain("run 42");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
    expect(o.rest.mock.calls[0]?.[2]).toContain("owner_id=eq.owner");
  });
});
