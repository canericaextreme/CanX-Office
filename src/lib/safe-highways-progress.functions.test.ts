import { describe, expect, it, vi } from "vitest";
import {
  readSafeHighwaysProgressWith,
  SAFE_HIGHWAYS_TASK_ID,
} from "./safe-highways-progress.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: () => vi.fn() }) }),
}));

const task = { id: SAFE_HIGHWAYS_TASK_ID, owner_id: "owner" };
function deps(body: unknown = [task], ok = true) {
  return {
    verify: vi.fn().mockResolvedValue({ ok: true, userId: "owner" }),
    read: vi.fn().mockResolvedValue({ ok, body }),
  };
}
describe("canonical Safe Highways progress read", () => {
  it("reads exactly the owner task, independently of recent task windows", async () => {
    const d = deps();
    expect(await readSafeHighwaysProgressWith(d, "token")).toEqual({ ok: true, task });
    expect(d.read).toHaveBeenCalledWith(
      "token",
      `manager_tasks?owner_id=eq.owner&id=eq.${SAFE_HIGHWAYS_TASK_ID}&select=*&limit=1`,
    );
  });
  it("does not read records when owner/MFA verification fails", async () => {
    const d = deps();
    d.verify.mockResolvedValue({ ok: false, message: "Two-step sign-in required" });
    expect((await readSafeHighwaysProgressWith(d, "token")).ok).toBe(false);
    expect(d.read).not.toHaveBeenCalled();
  });
  it.each([[], null, [{ ...task, id: "other" }], [{ ...task, owner_id: "other" }]])(
    "fails closed for missing or mismatched data %j",
    async (body) => {
      expect((await readSafeHighwaysProgressWith(deps(body), "token")).ok).toBe(false);
    },
  );
  it("reports read failure rather than initial progress", async () => {
    expect((await readSafeHighwaysProgressWith(deps([], false), "token")).ok).toBe(false);
  });
});
