// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BrainTaskInfo, NeedsItem } from "@/lib/brain-view";

const calls = { decide: vi.fn(), update: vi.fn(), cancel: vi.fn(), advise: vi.fn() };
vi.mock("@/lib/manager-work.functions", () => ({
  decideManagerApproval: "decide",
  updateManagerTask: "update",
  cancelManagerTask: "cancel",
}));
vi.mock("@/lib/brain-advice.functions", () => ({ getBrainAdvice: "advise" }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (name: "decide" | "update" | "cancel" | "advise") => calls[name],
}));
import { BrainNeedsYou } from "./BrainNeedsYou";
import { canQuickApprove, confirmText } from "@/lib/brain-needs-actions";

const task = (o: Partial<BrainTaskInfo> = {}): BrainTaskInfo => ({
  id: "t1",
  title: "Check Finance headings",
  saved: { title: "Check Finance headings", detail: "Keep this detail", project: "proj-1" },
  status: "waiting",
  worker: "Claude",
  waitingReason: "Draft #122 needs review",
  risk: "green",
  updatedAt: "2026-10-18T01:00:00Z",
  ...o,
});
const item = (o: Partial<NeedsItem> = {}): NeedsItem => ({
  kind: "waiting",
  id: "t1",
  title: "Check Finance headings",
  why: "On hold: Draft #122 needs review",
  room: "/build-testing",
  risk: "green",
  costCents: null,
  since: "2026-10-18T01:00:00Z",
  ...o,
});
const approval = item({
  kind: "approval",
  id: "a1",
  title: "Buy a domain",
  why: "Approval box: for Trails & Tales",
  room: "/approvals",
  costCents: 1500,
});

beforeEach(() => {
  for (const f of Object.values(calls)) {
    f.mockReset();
    f.mockResolvedValue({ id: "x" });
  }
});
afterEach(cleanup);

const renderList = (
  items: NeedsItem[] | null,
  opts: { canAct?: boolean; tasks?: BrainTaskInfo[] } = {},
) => {
  const onDone = vi.fn();
  render(
    <BrainNeedsYou
      items={items}
      tasks={opts.tasks ?? [task()]}
      token="tok"
      canAct={opts.canAct ?? true}
      onDone={onDone}
    />,
  );
  return onDone;
};

describe("Needs you", () => {
  it("shows each item's name, room and reason in plain words", () => {
    renderList([approval, item()]);
    expect(screen.getByRole("heading", { name: "Needs you (2)" })).toBeTruthy();
    expect(screen.getByText("Buy a domain")).toBeTruthy();
    expect(screen.getByText(/est\. 15\.00/)).toBeTruthy();
    expect(screen.getByText("Check Finance headings")).toBeTruthy();
    expect(screen.getByText("On hold: Draft #122 needs review")).toBeTruthy();
    expect(screen.getByText(/Build/)).toBeTruthy();
  });

  it("asks before archiving, then cancels the task with a note and never deletes", async () => {
    const onDone = renderList([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Archive: Check Finance headings" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Nothing is deleted/);
    expect(calls.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    await waitFor(() => expect(calls.cancel).toHaveBeenCalledTimes(1));
    expect(calls.cancel.mock.calls[0]![0]).toEqual({
      data: {
        accessToken: "tok",
        taskId: "t1",
        reason: "Archived by John from the Brain room (live Brain view).",
      },
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("cancel backs out without doing anything", () => {
    renderList([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Archive: Check Finance headings" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calls.cancel).not.toHaveBeenCalled();
  });

  it("resumes a task with its saved title, detail and project unchanged", async () => {
    renderList([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Approve: Check Finance headings" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /does not start a paid build, merge or publish/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    await waitFor(() => expect(calls.update).toHaveBeenCalledTimes(1));
    expect(calls.update.mock.calls[0]![0]).toEqual({
      data: {
        accessToken: "tok",
        taskId: "t1",
        title: "Check Finance headings",
        detail: "Keep this detail",
        project: "proj-1",
        risk: "green",
        status: "in_progress",
      },
    });
  });

  it("approves or archives approval-box requests through the approval decision", async () => {
    renderList([approval]);
    fireEvent.click(screen.getByRole("button", { name: "Approve: Buy a domain" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    await waitFor(() =>
      expect(calls.decide).toHaveBeenCalledWith({
        data: { accessToken: "tok", approvalId: "a1", decision: "approved" },
      }),
    );
    cleanup();
    renderList([approval]);
    fireEvent.click(screen.getByRole("button", { name: "Archive: Buy a domain" }));
    expect(screen.getByRole("alert").textContent).toMatch(/recorded as declined/);
    fireEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    await waitFor(() =>
      expect(calls.decide).toHaveBeenLastCalledWith({
        data: { accessToken: "tok", approvalId: "a1", decision: "declined" },
      }),
    );
  });

  it("shows the server's refusal instead of claiming success", async () => {
    calls.cancel.mockResolvedValue({
      ok: false,
      code: "forbidden",
      message: "That task belongs to a different owner.",
    });
    const onDone = renderList([item()]);
    fireEvent.click(screen.getByRole("button", { name: "Archive: Check Finance headings" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, archive" }));
    expect(await screen.findByText("That task belongs to a different owner.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("sends red-risk tasks to the Approvals room instead of a one-tap resume", () => {
    const red = item({ risk: "red" });
    expect(canQuickApprove(red)).toBe(false);
    renderList([red], { tasks: [task({ risk: "red" })] });
    expect(screen.getByRole("link", { name: "Approve in Approvals" }).getAttribute("href")).toBe(
      "/approvals",
    );
    expect(screen.queryByRole("button", { name: /^Approve:/ })).toBeNull();
  });

  it("has no buttons in a read-only view", () => {
    renderList([item()], { canAct: false });
    expect(screen.queryByRole("button", { name: /Archive/ })).toBeNull();
    expect(screen.getByText("Read-only view")).toBeTruthy();
  });

  it("says plainly when it can't read the lists, and when nothing is waiting", () => {
    renderList(null);
    expect(screen.getByText(/could not be read just now/)).toBeTruthy();
    cleanup();
    renderList([]);
    expect(screen.getByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("shows Elsie's advice under the item, with the facts she used", async () => {
    calls.advise.mockResolvedValue({
      ok: true,
      advisedAt: "2026-10-20T00:00:00Z",
      advice: {
        verdict: "approve",
        summary: "Draft #122 merged on 16 Oct, so this can resume.",
        reasons: ["#122 merged into main on 2026-10-16"],
        missing: [],
      },
      facts: {
        kind: "task",
        id: "t1",
        title: "x",
        status: "waiting",
        worker: "claude",
        risk: "green",
        detail: "",
        result: "",
        evidence: "",
        waitingReason: "Hold until #122 is reviewed",
        project: "",
        costCents: null,
        createdAt: "",
        updatedAt: "",
        ageDays: 1,
        approvals: [],
        history: [],
        changes: [],
        github: [{ ref: "#122", kind: "change", state: "merged into main on 2026-10-16" }],
        unread: [],
      },
    });
    renderList([item()]);
    fireEvent.click(
      within(screen.getByRole("list")).getByRole("button", {
        name: "Ask Elsie about: Check Finance headings",
      }),
    );
    expect(calls.advise).toHaveBeenCalledWith({
      data: { accessToken: "tok", kind: "task", id: "t1" },
    });
    const box = await screen.findByRole("status", {
      name: "Elsie's advice on Check Finance headings",
    });
    expect(within(box).getByText("Elsie suggests: Approve")).toBeTruthy();
    expect(within(box).getByText("Draft #122 merged on 16 Oct, so this can resume.")).toBeTruthy();
    expect(within(box).getByText(/Draft change #122: merged into main on 2026-10-16/)).toBeTruthy();
    expect(within(box).getByText("Advice only. You decide with the buttons.")).toBeTruthy();
    // Advice never presses a button for John.
    expect(calls.update).not.toHaveBeenCalled();
    expect(calls.cancel).not.toHaveBeenCalled();
  });

  it("shows Elsie's refusal plainly when she can't advise", async () => {
    calls.advise.mockResolvedValue({ ok: false, message: "Daily AI limit reached." });
    renderList([approval]);
    fireEvent.click(screen.getByRole("button", { name: "Ask Elsie about: Buy a domain" }));
    expect(await screen.findByText("Daily AI limit reached.")).toBeTruthy();
    expect(calls.advise).toHaveBeenCalledWith({
      data: { accessToken: "tok", kind: "approval", id: "a1" },
    });
  });

  it("explains every action honestly", () => {
    expect(confirmText(approval, "approve")).toMatch(/Work Board as approved work/);
    expect(confirmText(item(), "archive")).toMatch(/cancelled/);
  });
});
