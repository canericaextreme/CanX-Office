import { describe, expect, it, vi } from "vitest";
import {
  assignManagerTaskWith,
  classifyManagerRisk,
  createManagerTaskWith,
  decideManagerApprovalWith,
  getManagerBudgetStatusWith,
  loadManagerMemoryWith,
  logManagerChangeWith,
  requestManagerApprovalWith,
  runManagerSecondEyesWith,
  verifyManagerTaskWith,
  type WorkbenchDeps,
} from "@/lib/manager-work.functions";
import type { BudgetResult, OwnerVerification } from "@/lib/canx-backend.server";

function okOwner(userId = "owner-1"): OwnerVerification {
  return { ok: true, userId, aal: "aal2", email: "john@example.com" };
}

function failOwner(): OwnerVerification {
  return { ok: false, reason: "no_session", message: "You are not signed in." };
}

function mockDeps(overrides?: Partial<WorkbenchDeps>): WorkbenchDeps {
  return {
    verifyOwner: vi.fn().mockResolvedValue(okOwner()),
    reserve: vi.fn().mockResolvedValue({ allowed: true, reservationId: "res-1", remainingToday: 100 } satisfies BudgetResult),
    settle: vi.fn().mockResolvedValue(undefined),
    ensureBudget: vi.fn().mockResolvedValue({ ok: true }),
    rest: vi.fn().mockResolvedValue(Promise.resolve({ ok: true, data: [] })),
    ...overrides,
  };
}

describe("risk classification", () => {
  it("classifies routine internal actions as green", () => {
    expect(classifyManagerRisk("create_task")).toBe("green");
    expect(classifyManagerRisk("assign_task")).toBe("green");
    expect(classifyManagerRisk("verify_task")).toBe("green");
    expect(classifyManagerRisk("log_change")).toBe("green");
    expect(classifyManagerRisk("second_eyes_review")).toBe("green");
    expect(classifyManagerRisk("preview_appearance")).toBe("green");
    expect(classifyManagerRisk("propose_task")).toBe("green");
  });

  it("classifies sending email as yellow", () => {
    expect(classifyManagerRisk("send_email")).toBe("yellow");
  });

  it("classifies major/risky actions as yellow", () => {
    expect(classifyManagerRisk("schema_change")).toBe("yellow");
    expect(classifyManagerRisk("migrate")).toBe("yellow");
    expect(classifyManagerRisk("major_change")).toBe("yellow");
  });

  it("classifies production/safety/spend actions as red", () => {
    expect(classifyManagerRisk("deploy")).toBe("red");
    expect(classifyManagerRisk("publish")).toBe("red");
    expect(classifyManagerRisk("purchase")).toBe("red");
    expect(classifyManagerRisk("subscribe")).toBe("red");
    expect(classifyManagerRisk("safety_critical")).toBe("red");
    expect(classifyManagerRisk("authorize_spend")).toBe("red");
  });

  it("classifies routine cross-project coordination as green", () => {
    expect(classifyManagerRisk("update", "safe_highways")).toBe("green");
    expect(classifyManagerRisk("change", "trail_tales")).toBe("green");
    expect(classifyManagerRisk("coordinate", "cross_project")).toBe("green");
  });

  it("classifies major or risky cross-project changes as yellow", () => {
    expect(classifyManagerRisk("bulk_update", "safe_highways")).toBe("yellow");
    expect(classifyManagerRisk("restructure", "trail_tales")).toBe("yellow");
  });


  it("classifies routine cross-project reads as green", () => {
    expect(classifyManagerRisk("read", "safe_highways")).toBe("green");
    expect(classifyManagerRisk("list", "trail_tales")).toBe("green");
  });
});

describe("memory and budget", () => {
  it("loadManagerMemoryWith fails closed when owner verification fails", async () => {
    const deps = mockDeps({ verifyOwner: vi.fn().mockResolvedValue(failOwner()) });
    const result = await loadManagerMemoryWith(deps, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "auth_not_ready" }));
    expect(deps.rest).not.toHaveBeenCalled();
  });

  it("loadManagerMemoryWith fails closed when budget setup fails", async () => {
    const deps = mockDeps({ ensureBudget: vi.fn().mockResolvedValue({ ok: false, error: "migration missing" }) });
    const result = await loadManagerMemoryWith(deps, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "context_unavailable" }));
    expect(deps.rest).not.toHaveBeenCalled();
  });

  it("loadManagerMemoryWith returns tasks, approvals, changes and budget", async () => {
    const tasks = [{ id: "t1", title: "Task 1" }];
    const approvals = [{ id: "a1", title: "Approval 1" }];
    const changes = [{ id: 1, action: "task.create" }];
    const budget = { used_cents: 0, ceiling_cents: 10000, warn_cents: 7500, paused: false, warning: false };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path.startsWith("manager_tasks")) return { ok: true, data: tasks };
      if (path.startsWith("manager_assignments")) return { ok: true, data: [] };
      if (path.startsWith("manager_approvals")) return { ok: true, data: approvals };
      if (path.startsWith("manager_changes")) return { ok: true, data: changes };
      if (path.startsWith("rpc/manager_budget_status")) return { ok: true, data: budget };
      return { ok: true, data: [] };
    });
    const deps = mockDeps({ rest });
    const result = await loadManagerMemoryWith(deps, "token");
    expect(result).toEqual(expect.objectContaining({ ok: true, tasks, approvals, changes, budget }));
  });

  it("getManagerBudgetStatusWith fails closed when budget setup fails", async () => {
    const deps = mockDeps({ ensureBudget: vi.fn().mockResolvedValue({ ok: false, error: "migration missing" }) });
    const result = await getManagerBudgetStatusWith(deps, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "context_unavailable" }));
  });
});

describe("task lifecycle", () => {
  it("createManagerTaskWith fails closed when title is empty", async () => {
    const deps = mockDeps();
    const result = await createManagerTaskWith(deps, { accessToken: "token", title: "   " });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "invalid_input" }));
    expect(deps.rest).not.toHaveBeenCalled();
  });

  it("createManagerTaskWith inserts a task and logs the change", async () => {
    const inserted = { id: "t1", title: "New task", risk: "green", status: "open" };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path === "manager_tasks") return Promise.resolve({ ok: true, data: inserted });
      if (path === "rpc/log_manager_change") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await createManagerTaskWith(deps, { accessToken: "token", title: "New task" });
    expect(result).toEqual(inserted);
    expect(rest).toHaveBeenCalledWith("token", "POST", "manager_tasks", expect.any(Object));
    expect(rest).toHaveBeenCalledWith("token", "POST", "rpc/log_manager_change", expect.any(Object));
  });

  it("assignManagerTaskWith updates the worker and logs the change", async () => {
    const updated = { id: "t1", owner_id: "owner-1", title: "Task", worker: "Claude" };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path.startsWith("manager_tasks")) return Promise.resolve({ ok: true, data: [updated] });
      if (path === "manager_assignments") return Promise.resolve({ ok: true, data: { id: "as1", task_id: "t1", worker: "Claude" } });
      if (path === "rpc/log_manager_change") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await assignManagerTaskWith(deps, { accessToken: "token", taskId: "t1", worker: "Claude" });
    expect(result).toEqual(updated);
    expect(rest).toHaveBeenCalledWith("token", "POST", "manager_assignments", expect.objectContaining({ worker: "Claude" }));
  });

  it("verifyManagerTaskWith marks a task done and logs the change", async () => {
    const updated = { id: "t1", owner_id: "owner-1", title: "Task", status: "done", worker: "Claude" };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path.startsWith("manager_tasks?id=eq")) return Promise.resolve({ ok: true, data: [updated] });
      if (path.startsWith("manager_tasks")) return Promise.resolve({ ok: true, data: [updated] });
      if (path === "rpc/log_manager_change") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await verifyManagerTaskWith(deps, { accessToken: "token", taskId: "t1", result: "Done", evidence: "Test passed" });
    expect(result).toEqual(updated);
    expect(rest).toHaveBeenCalledWith("token", "PATCH", "manager_tasks?id=eq.t1", expect.objectContaining({ status: "done" }));
  });
});

describe("approval box", () => {
  it("requestManagerApprovalWith creates an approval and logs the change", async () => {
    const inserted = { id: "a1", title: "Spend $5", status: "pending" };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path === "manager_approvals") return Promise.resolve({ ok: true, data: inserted });
      if (path === "rpc/log_manager_change") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await requestManagerApprovalWith(deps, {
      accessToken: "token",
      title: "Spend $5",
      detail: "API call",
      costCents: 500,
      risk: "yellow",
    });
    expect(result).toEqual(inserted);
    expect(rest).toHaveBeenCalledWith("token", "POST", "manager_approvals", expect.objectContaining({ cost_cents: 500 }));
  });

  it("decideManagerApprovalWith updates status and logs the change", async () => {
    const before = { id: "a1", owner_id: "owner-1", status: "pending" };
    const after = { id: "a1", owner_id: "owner-1", status: "approved" };
    const rest = vi.fn().mockImplementation((_token, _method, path) => {
      if (path.startsWith("manager_approvals?id=eq.a1") && _method === "GET") return Promise.resolve({ ok: true, data: [before] });
      if (path.startsWith("manager_approvals") && _method === "PATCH") return Promise.resolve({ ok: true, data: after });
      if (path === "rpc/log_manager_change") return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await decideManagerApprovalWith(deps, { accessToken: "token", approvalId: "a1", decision: "approved" });
    expect(result).toEqual(after);
    expect(rest).toHaveBeenCalledWith("token", "PATCH", "manager_approvals?id=eq.a1", expect.objectContaining({ status: "approved" }));
  });

  it("approving an unlinked item puts it on the Work Board and links it", async () => {
    const before = { id: "a1", owner_id: "owner-1", status: "pending", title: "Buy parts", detail: "", risk: "yellow", task_id: null };
    const approved = { ...before, status: "approved" };
    const rest = vi.fn().mockImplementation((_token, method, path, body) => {
      if (path.startsWith("manager_approvals?id=eq.a1") && method === "GET") return Promise.resolve({ ok: true, data: [before] });
      if (path.startsWith("manager_approvals") && method === "PATCH") {
        const patched = { ...approved, ...(body as Record<string, unknown>) };
        return Promise.resolve({ ok: true, data: [patched] });
      }
      if (path === "manager_tasks" && method === "POST") return Promise.resolve({ ok: true, data: [{ id: "t9", title: "Buy parts" }] });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    const result = await decideManagerApprovalWith(deps, { accessToken: "token", approvalId: "a1", decision: "approved" });
    expect(result).toMatchObject({ status: "approved", task_id: "t9" });
    expect(rest).toHaveBeenCalledWith("token", "POST", "manager_tasks", expect.objectContaining({ title: "Buy parts" }));
  });

  it("declining an item never creates Work Board work", async () => {
    const before = { id: "a1", owner_id: "owner-1", status: "pending", title: "Buy parts", risk: "yellow", task_id: null };
    const rest = vi.fn().mockImplementation((_token, method, path) => {
      if (path.startsWith("manager_approvals?id=eq.a1") && method === "GET") return Promise.resolve({ ok: true, data: [before] });
      if (path.startsWith("manager_approvals") && method === "PATCH")
        return Promise.resolve({ ok: true, data: [{ ...before, status: "declined" }] });
      return Promise.resolve({ ok: true, data: [] });
    });
    const deps = mockDeps({ rest });
    await decideManagerApprovalWith(deps, { accessToken: "token", approvalId: "a1", decision: "declined" });
    expect(rest).not.toHaveBeenCalledWith("token", "POST", "manager_tasks", expect.anything());
  });
});

describe("change log", () => {
  it("logManagerChangeWith appends a change record", async () => {
    const rest = vi.fn().mockResolvedValue({ ok: true });
    const deps = mockDeps({ rest });
    const result = await logManagerChangeWith(deps, {
      accessToken: "token",
      action: "theme.preview",
      entity: "appearance",
      entityId: "theme",
      before: { old: "value" },
      after: { new: "value" },
    });
    expect(result).toEqual({ ok: true });
    expect(rest).toHaveBeenCalledWith("token", "POST", "rpc/log_manager_change", expect.objectContaining({
      _owner_id: "owner-1",
      _action: "theme.preview",
      _entity: "appearance",
      _entity_id: "theme",
    }));
  });
});

describe("second eyes", () => {
  it("runManagerSecondEyesWith fails closed when owner verification fails", async () => {
    const deps = mockDeps({ verifyOwner: vi.fn().mockResolvedValue(failOwner()) });
    const result = await runManagerSecondEyesWith(deps, {
      accessToken: "token",
      subject: "Test",
      primaryRecommendation: "Do it",
      evidence: "None",
      question: "Should we?",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("auth_not_ready");
  });
});
