import { describe, expect, it, vi } from "vitest";
import { editElsieTaskWith, submitTaskCorrectionWith } from "./elsie-task-tools.server";
import type { ManagerTask, WorkbenchDeps } from "./manager-work.functions";
import type { TaskExecutionDeps } from "./task-execution.server";
import { sanitizeToolArgs } from "./manager.functions";
const id = "11111111-1111-4111-8111-111111111111";
function setup(overrides: Partial<ManagerTask> = {}) {
  const parent: ManagerTask = {
    id,
    owner_id: "owner",
    title: "Update reception page label",
    detail: "Keep the navigation and add clearer reception help text.",
    project: "CanX Office",
    status: "open",
    risk: "green",
    worker: "Codex",
    result: "Original result",
    evidence: "",
    created_at: "before",
    updated_at: "before",
    ...overrides,
  };
  const rows = new Map([[id, parent]]);
  let loseClaim = false;
  const rest = vi.fn(
    async (_token: string, method: string, path: string, body?: Record<string, unknown>) => {
      if (path.startsWith("rpc/")) return { ok: true, data: [] };
      const key = new URLSearchParams(path.split("?")[1]).get("id")?.slice(3);
      if (method === "GET")
        return { ok: true, data: key && rows.has(key) ? [{ ...rows.get(key)! }] : [] };
      if (method === "POST") {
        if (rows.has(String(body?.["id"]))) return { ok: false };
        const row = { ...parent, ...body, created_at: "new", updated_at: "new" } as ManagerTask;
        rows.set(row.id, row);
        return { ok: true, data: [{ ...row }] };
      }
      if (method === "PATCH" && key && rows.has(key)) {
        if (loseClaim) return { ok: true, data: [] };
        const row = { ...rows.get(key)!, ...body } as ManagerTask;
        rows.set(key, row);
        return { ok: true, data: [{ ...row }] };
      }
      throw new Error("Unexpected operation");
    },
  );
  const build = vi.fn().mockResolvedValue({
    ok: true,
    detail: "Draft accepted",
    runs: [{ id: 99, state: "queued", url: "fixture" }],
  });
  const verifyOwner = vi.fn().mockResolvedValue({ ok: true, userId: "owner" });
  const deps: TaskExecutionDeps = {
    workbench: { rest, verifyOwner } as unknown as WorkbenchDeps,
    build,
  };
  return {
    deps,
    rest,
    rows,
    parent,
    build,
    verifyOwner,
    lose: () => {
      loseClaim = true;
    },
  };
}
const completed = {
  evidence: JSON.stringify({
    kind: "office-task-v2",
    builder: "codex",
    attempt: "original",
    runId: 42,
    state: "success",
    prior: "History",
  }),
  status: "done" as const,
};
describe("Elsie existing task tools", () => {
  it("edits the same owner task with a conditional write and preserves history and other fields", async () => {
    const h = setup();
    expect(
      (await editElsieTaskWith(h.deps, "token", id, { detail: "New requested requirements" })).ok,
    ).toBe(true);
    expect(h.rows.get(id)).toEqual({
      ...h.parent,
      detail: "New requested requirements",
      updated_at: expect.any(String),
    });
    expect(h.rest.mock.calls.find((c) => c[1] === "PATCH")?.[2]).toContain(
      "owner_id=eq.owner&updated_at=eq.before&evidence=eq.&status=eq.open",
    );
    expect(h.build).not.toHaveBeenCalled();
  });
  it.each([
    completed,
    { evidence: "Codex handoff unconfirmed" },
    { evidence: "[elsie-queue codex now]" },
    { status: "cancelled" as const },
  ])("refuses edits of finished or attempted tasks: %j", async (override) => {
    const h = setup(override);
    expect((await editElsieTaskWith(h.deps, "token", id, { title: "Replacement" })).ok).toBe(false);
    expect(h.rest.mock.calls.every((c) => c[1] === "GET")).toBe(true);
  });
  it("fails closed on owner denial, foreign owner and lost edit claim", async () => {
    const h = setup();
    h.verifyOwner.mockResolvedValueOnce({ ok: false, message: "Denied" });
    expect((await editElsieTaskWith(h.deps, "token", id, { title: "New" })).ok).toBe(false);
    expect(h.rest).not.toHaveBeenCalled();
    const foreign = setup({ owner_id: "other" });
    expect(
      (await submitTaskCorrectionWith(foreign.deps, "token", id, "Fix label", "codex")).ok,
    ).toBe(false);
    h.lose();
    expect((await editElsieTaskWith(h.deps, "token", id, { title: "New" })).ok).toBe(false);
  });
  it("returns a new amendment receipt, preserves all original data and retries without another build", async () => {
    const h = setup(completed);
    const first = await submitTaskCorrectionWith(
      h.deps,
      "token",
      id,
      "Change the page help text to Welcome.",
      "codex",
    );
    expect(first.ok).toBe(true);
    expect(first.detail).toContain("Amendment receipt");
    const child = [...h.rows.values()].find((t) => t.id !== id)!;
    expect(child.detail).toContain(h.parent.detail);
    expect(child.detail).toContain(`Amendment of task ${id}, build 42`);
    expect(h.rows.get(id)).toEqual(h.parent);
    expect(JSON.parse(child.evidence).runId).toBe(99);
    const retry = await submitTaskCorrectionWith(
      h.deps,
      "token",
      id,
      "Change the page help text to Welcome.",
      "codex",
    );
    expect(retry.detail).toContain(child.id);
    expect(retry.detail).toContain("Build 99");
    expect(h.build).toHaveBeenCalledOnce();
    await submitTaskCorrectionWith(h.deps, "token", id, "Use a larger page label.", "codex");
    expect(h.rows.size).toBe(3);
  });
  it("does not dispatch after losing the amendment execution claim", async () => {
    const h = setup(completed);
    h.lose();
    expect(
      (await submitTaskCorrectionWith(h.deps, "token", id, "Fix the page label.", "codex")).ok,
    ).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
    expect(h.rows.get(id)).toEqual(h.parent);
  });
  it("recovers a saved amendment after a lost insert response without creating another task", async () => {
    const h = setup(completed);
    const original = h.rest.getMockImplementation()!;
    h.rest.mockImplementation(async (...args) => {
      const result = await original(...args);
      return args[1] === "POST" && args[2] === "manager_tasks" ? { ok: false } : result;
    });
    expect(
      (await submitTaskCorrectionWith(h.deps, "token", id, "Fix the page label.", "codex")).ok,
    ).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
    expect(
      (await submitTaskCorrectionWith(h.deps, "token", id, "Fix the page label.", "codex")).ok,
    ).toBe(true);
    expect(h.rows.size).toBe(2);
    expect(h.build).toHaveBeenCalledOnce();
  });
  it("never retries a submission with an unknown outcome", async () => {
    const h = setup(completed);
    h.build.mockRejectedValueOnce(new Error("timeout"));
    await submitTaskCorrectionWith(h.deps, "token", id, "Fix the page label.", "codex");
    const retry = await submitTaskCorrectionWith(
      h.deps,
      "token",
      id,
      "Fix the page label.",
      "codex",
    );
    expect(retry.detail).toContain("uncertain");
    expect(h.build).toHaveBeenCalledOnce();
  });
  it.each([{ risk: "red" as const }, { project: "Other project" }])(
    "uses unchanged executor checks for amendments: %j",
    async (override) => {
      const h = setup({ ...completed, ...override });
      expect(
        (await submitTaskCorrectionWith(h.deps, "token", id, "Fix the page label.", "codex")).ok,
      ).toBe(false);
      expect(h.build).not.toHaveBeenCalled();
    },
  );
  it("refuses active drafts, builder switching and protected corrections", async () => {
    const active = setup();
    expect(
      (await submitTaskCorrectionWith(active.deps, "token", id, "Fix label", "codex")).ok,
    ).toBe(false);
    const h = setup(completed);
    expect((await submitTaskCorrectionWith(h.deps, "token", id, "Fix label", "claude")).ok).toBe(
      false,
    );
    expect(
      (
        await submitTaskCorrectionWith(
          h.deps,
          "token",
          id,
          "Change authentication permissions.",
          "codex",
        )
      ).ok,
    ).toBe(false);
    expect(h.build).not.toHaveBeenCalled();
  });
  it("filters immutable tool fields and rejects excessive input without truncation", async () => {
    expect(
      sanitizeToolArgs(
        "edit_task",
        JSON.stringify({ task_id: id, evidence: "", status: "open", detail: "New" }),
      ),
    ).toEqual({ task_id: id, detail: "New" });
    const correction = "x".repeat(2001);
    expect(
      sanitizeToolArgs("submit_task_correction", JSON.stringify({ task_id: id, correction })),
    ).toEqual({ task_id: id, correction });
    const h = setup(completed);
    expect((await submitTaskCorrectionWith(h.deps, "token", id, correction, "codex")).ok).toBe(
      false,
    );
    expect(h.rows.size).toBe(1);
  });
});
