import { describe, expect, it } from "vitest";
import type { ManagerApproval, ManagerTask } from "@/lib/manager-work.functions";
import {
  confirmWords,
  decisionsForJohn,
  declineResult,
  resumeStatus,
} from "./work-board-decisions";

const task = (over: Partial<ManagerTask>): ManagerTask => ({
  id: "t1",
  owner_id: "o",
  title: "A task",
  detail: "Detail",
  status: "open",
  risk: "green",
  worker: "",
  result: "",
  evidence: "",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-18T00:00:00Z",
  ...over,
});

const approval = (over: Partial<ManagerApproval>): ManagerApproval => ({
  id: "a1",
  owner_id: "o",
  task_id: null,
  title: "Request",
  detail: "Why",
  cost_cents: null,
  risk: "yellow",
  status: "pending",
  created_at: "2026-10-18T00:00:00Z",
  decided_at: null,
  ...over,
});

describe("decisionsForJohn", () => {
  it("lists pending approvals, tasks on hold and unapproved yellow tasks, and nothing else", () => {
    const tasks = [
      task({ id: "hold", status: "waiting", waiting_reason: "Waiting for John's review" }),
      task({ id: "yellow", risk: "yellow" }),
      task({ id: "green-open" }),
      task({ id: "done", status: "done", risk: "yellow" }),
      task({ id: "cancelled", status: "cancelled", risk: "yellow" }),
      task({ id: "red-hold", status: "waiting", risk: "red" }),
    ];
    const items = decisionsForJohn(tasks, [
      approval({}),
      approval({ id: "old", status: "approved" }),
    ]);
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      "approval:a1",
      "on-hold:hold",
      "yellow:yellow",
    ]);
    expect(items[1]!.why).toBe("Waiting for John's review");
  });

  it("drops a yellow task once John has approved or declined it", () => {
    const items = decisionsForJohn(
      [task({ id: "y", risk: "yellow" })],
      [approval({ task_id: "y", status: "approved" })],
    );
    expect(items).toEqual([]);
  });

  it("keeps a yellow task whose only approval is still pending", () => {
    const items = decisionsForJohn(
      [task({ id: "y", risk: "yellow" })],
      [approval({ task_id: "y" })],
    );
    expect(items.map((i) => i.id)).toEqual(["a1", "y"]);
  });

  it("says plainly when an on-hold reason is missing", () => {
    expect(decisionsForJohn([task({ status: "waiting" })], [])[0]!.why).toMatch(/not recorded/);
  });
});

describe("decline and resume", () => {
  const at = new Date("2026-10-19T08:00:00Z");

  it("keeps the earlier result word for word and adds the decline note", () => {
    expect(declineResult(task({ result: "Build failed." }), at)).toBe(
      "Build failed.\n\nDeclined by John on the Work Board, 2026-10-19.",
    );
    expect(declineResult(task({}), at)).toBe("Declined by John on the Work Board, 2026-10-19.");
  });

  it("never cuts a long earlier result: it sends an empty reason so the result stays as it was", () => {
    expect(declineResult(task({ result: "x".repeat(1990) }), at)).toBe("");
  });

  it("resumes to in progress when someone is assigned, otherwise to planned", () => {
    expect(resumeStatus(task({ worker: "Claude" }))).toBe("in_progress");
    expect(resumeStatus(task({ worker: " " }))).toBe("open");
  });

  it("confirmation words promise no build, merge or publish", () => {
    const [item] = decisionsForJohn([task({ status: "waiting", worker: "Claude" })], []);
    expect(confirmWords(item!, "approve")).toMatch(
      /back to in progress.*does not start a paid build, merge or publish/,
    );
    expect(confirmWords(item!, "decline")).toMatch(/Nothing is deleted/);
  });
});
