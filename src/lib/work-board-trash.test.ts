import { describe, expect, it } from "vitest";
import type { ManagerMemory, ManagerTask } from "./manager-work.functions";
import { isInTrash, runTrashSweep, SWEEP_IDLE_MS } from "./work-board-trash";

const now = Date.parse("2026-10-20T12:00:00Z");
const old = new Date(now - SWEEP_IDLE_MS).toISOString();
const recent = new Date(now - SWEEP_IDLE_MS + 1).toISOString();
const task = (status: ManagerTask["status"], overrides: Partial<ManagerTask> = {}): ManagerTask => ({
  id: status, owner_id: "owner", title: status, detail: "Preserve me", status, risk: "green", worker: "",
  result: "Saved result", evidence: "Saved evidence", created_at: old, updated_at: old, ...overrides,
});
const memory = (tasks: ManagerTask[]) => ({ tasks, assignments: [], approvals: [], changes: [] }) as Pick<ManagerMemory, "tasks" | "assignments" | "approvals" | "changes">;

describe("manual Work Board trash sweep", () => {
  it.each(["open", "in_progress", "waiting"] as const)("never archives %s, however old", (status) => {
    const m = memory([task(status, { updated_at: "2000-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" })]);
    expect(runTrashSweep(m, [], now)).toEqual([]);
    expect(isInTrash(m.tasks[0]!, m, [status], now)).toBe(false);
  });
  it("moves only terminal tasks at the seven-day boundary and preserves all data/history", () => {
    const m = memory([task("done"), task("cancelled"), task("open")]);
    const before = structuredClone(m);
    expect(runTrashSweep(m, [], now)).toEqual(["done", "cancelled"]);
    expect(runTrashSweep(m, ["done"], now)).toEqual(["done", "cancelled"]);
    expect(m).toEqual(before);
  });
  it.each([recent, "invalid", "", new Date(now + 1).toISOString()])("keeps recent, unknown or future activity: %s", (updated_at) => {
    expect(runTrashSweep(memory([task("done", { updated_at })]), [], now)).toEqual([]);
  });
  it("keeps terminal tasks with a waiting reason", () => {
    expect(runTrashSweep(memory([task("done", { waiting_reason: "Needs review" })]), [], now)).toEqual([]);
  });
  it("keeps tasks with pending approvals, unfinished assignments or recent related activity", () => {
    const m = memory([task("done")]);
    m.approvals = [{ id: "a", task_id: "done", status: "pending", created_at: old }] as ManagerMemory["approvals"];
    expect(runTrashSweep(m, [], now)).toEqual([]);
    m.approvals = [{ id: "a", task_id: "done", status: "approved", created_at: old, decided_at: recent }] as ManagerMemory["approvals"];
    expect(runTrashSweep(m, [], now)).toEqual([]);
    m.approvals = [];
    m.assignments = [{ id: "as", task_id: "done", assigned_at: old, completed_at: null }] as ManagerMemory["assignments"];
    expect(runTrashSweep(m, [], now)).toEqual([]);
    m.assignments[0]!.completed_at = recent;
    expect(runTrashSweep(m, [], now)).toEqual([]);
    m.assignments[0]!.completed_at = old;
    m.changes = [{ entity: "manager_tasks", entity_id: "done", at: recent }] as ManagerMemory["changes"];
    expect(runTrashSweep(m, [], now)).toEqual([]);
    m.changes = [];
    expect(runTrashSweep(m, [], now)).toEqual(["done"]);
    m.tasks[0]!.updated_at = recent;
    expect(isInTrash(m.tasks[0]!, m, ["done"], now)).toBe(false);
  });
});
