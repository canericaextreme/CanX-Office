// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ManagerApproval, ManagerMemory, ManagerTask } from "@/lib/manager-work.functions";

const fns = vi.hoisted(() => ({
  requestManagerApproval: vi.fn(),
  decideManagerApproval: vi.fn(),
  updateManagerTask: vi.fn(),
  cancelManagerTask: vi.fn(),
  createManagerTask: vi.fn(),
  assignManagerTask: vi.fn(),
  verifyManagerTask: vi.fn(),
}));
const refresh = vi.fn();
let memory: ManagerMemory;

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({
    to,
    children,
    ...rest
  }: { to?: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={String(to ?? "")} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/office/RoomShell", () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/manager-work.functions", () => fns);
vi.mock("@/lib/use-manager-memory", () => ({
  useManagerMemory: () => ({
    memory,
    loading: false,
    error: null,
    isOwner: true,
    accessToken: "owner-token",
    sessionMessage: "",
    refresh,
  }),
}));

import { WorkBoard } from "./work-board";

const task = (over: Partial<ManagerTask>): ManagerTask => ({
  id: "t",
  owner_id: "o",
  title: "Task",
  detail: "Saved detail",
  status: "open",
  risk: "green",
  worker: "",
  result: "",
  evidence: "",
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-18T00:00:00Z",
  project: "CanX Office",
  ...over,
});

const pending: ManagerApproval = {
  id: "ap1",
  owner_id: "o",
  task_id: null,
  title: "Buy a domain",
  detail: "Needed for the website",
  cost_cents: 1500,
  risk: "yellow",
  status: "pending",
  created_at: "2026-10-18T00:00:00Z",
  decided_at: null,
};

beforeEach(() => {
  for (const fn of Object.values(fns)) fn.mockReset();
  refresh.mockReset();
  fns.requestManagerApproval.mockResolvedValue({ id: "new-approval" });
  fns.decideManagerApproval.mockResolvedValue({ id: "new-approval", status: "approved" });
  fns.updateManagerTask.mockResolvedValue({ id: "hold" });
  fns.cancelManagerTask.mockResolvedValue({ id: "hold" });
  memory = {
    ok: true,
    tasks: [
      task({
        id: "hold",
        title: "Finance headings",
        status: "waiting",
        waiting_reason: "Waiting for John's review of PR 122",
        worker: "Claude",
        result: "Build passed.",
      }),
      task({ id: "yellow", title: "Legal deadlines", risk: "yellow" }),
      task({ id: "plain", title: "Ordinary job" }),
    ],
    assignments: [],
    approvals: [pending],
    changes: [],
    budget: { used_cents: 0, ceiling_cents: 0, warn_cents: 0, paused: false, warning: false },
  };
});
afterEach(cleanup);

const card = (id: string) => document.getElementById(`task-${id}`)!;

describe("Work Board decisions waiting on John", () => {
  it("counts and marks every item waiting on John, and only those", () => {
    render(<WorkBoard />);
    expect(screen.getByRole("heading", { name: "John — 3 items need your decision" })).toBeTruthy();
    expect(within(card("hold")).getByText("John — review needed")).toBeTruthy();
    expect(within(card("hold")).getByText("Waiting for John's review of PR 122")).toBeTruthy();
    expect(within(card("yellow")).getByText("John — review needed")).toBeTruthy();
    expect(within(card("plain")).queryByText("John — review needed")).toBeNull();
    expect(within(card("plain")).queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open details: Finance headings" }).getAttribute("href"),
    ).toBe("#task-hold");
  });

  it("the filter shows only what needs John, and back", () => {
    render(<WorkBoard />);
    fireEvent.click(screen.getByRole("button", { name: "Needs John" }));
    expect(document.getElementById("task-plain")).toBeNull();
    expect(card("hold")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(card("plain")).toBeTruthy();
  });

  it("Approve asks first and does nothing until confirmed", () => {
    render(<WorkBoard />);
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Approve Finance headings" }));
    expect(within(card("hold")).getByText(/Approve and resume\?/)).toBeTruthy();
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Go back" }));
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("approving a task on hold records the decision, then resumes it with its saved fields unchanged", async () => {
    render(<WorkBoard />);
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Approve Finance headings" }));
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Yes, approve" }));
    await waitFor(() => expect(fns.updateManagerTask).toHaveBeenCalled());
    expect(fns.requestManagerApproval.mock.calls[0]![0].data).toMatchObject({
      taskId: "hold",
      accessToken: "owner-token",
    });
    expect(fns.decideManagerApproval.mock.calls[0]![0].data).toMatchObject({
      approvalId: "new-approval",
      decision: "approved",
    });
    expect(fns.updateManagerTask.mock.calls[0]![0].data).toEqual({
      accessToken: "owner-token",
      taskId: "hold",
      title: "Finance headings",
      detail: "Saved detail",
      project: "CanX Office",
      risk: "green",
      status: "in_progress",
    });
    expect(fns.cancelManagerTask).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Approved and resumed."),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("declining a task records the decision and cancels it, keeping its earlier result", async () => {
    fns.decideManagerApproval.mockResolvedValue({ id: "new-approval", status: "declined" });
    render(<WorkBoard />);
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Decline Finance headings" }));
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Yes, decline" }));
    await waitFor(() => expect(fns.cancelManagerTask).toHaveBeenCalled());
    expect(fns.decideManagerApproval.mock.calls[0]![0].data.decision).toBe("declined");
    expect(fns.cancelManagerTask.mock.calls[0]![0].data.reason).toMatch(
      /^Build passed\.\n\nDeclined by John on the Work Board, \d{4}-\d\d-\d\d\.$/,
    );
    expect(fns.updateManagerTask).not.toHaveBeenCalled();
  });

  it("approving a yellow task records approval only; the task status is not touched", async () => {
    render(<WorkBoard />);
    fireEvent.click(
      within(card("yellow")).getByRole("button", { name: "Approve Legal deadlines" }),
    );
    fireEvent.click(within(card("yellow")).getByRole("button", { name: "Yes, approve" }));
    await waitFor(() => expect(fns.decideManagerApproval).toHaveBeenCalled());
    expect(fns.updateManagerTask).not.toHaveBeenCalled();
    expect(fns.cancelManagerTask).not.toHaveBeenCalled();
  });

  it("an Approval Box request is decided directly with the existing decision action", async () => {
    render(<WorkBoard />);
    const box = screen.getByText("Buy a domain").closest("div.rounded-lg") as HTMLElement;
    expect(within(box).getByText("Estimated cost: 15.00")).toBeTruthy();
    fireEvent.click(within(box).getByRole("button", { name: "Decline Buy a domain" }));
    fireEvent.click(within(box).getByRole("button", { name: "Yes, decline" }));
    await waitFor(() => expect(fns.decideManagerApproval).toHaveBeenCalled());
    expect(fns.decideManagerApproval.mock.calls[0]![0].data).toEqual({
      accessToken: "owner-token",
      approvalId: "ap1",
      decision: "declined",
    });
    expect(fns.requestManagerApproval).not.toHaveBeenCalled();
  });

  it("if recording the decision fails, the task is left exactly as it was and John is told", async () => {
    fns.requestManagerApproval.mockResolvedValue({ ok: false, message: "Owner check failed." });
    render(<WorkBoard />);
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Decline Finance headings" }));
    fireEvent.click(within(card("hold")).getByRole("button", { name: "Yes, decline" }));
    await waitFor(() =>
      expect(within(card("hold")).getByRole("alert").textContent).toBe("Owner check failed."),
    );
    expect(fns.cancelManagerTask).not.toHaveBeenCalled();
    expect(fns.updateManagerTask).not.toHaveBeenCalled();
  });

  it("says so plainly when nothing is waiting", () => {
    memory = { ...memory, approvals: [], tasks: [task({ id: "plain" })] };
    render(<WorkBoard />);
    expect(
      screen.getByRole("heading", { name: "Nothing is waiting on you right now." }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show only/ })).toBeNull();
  });
});

describe("Work Board compact filters", () => {
  it("keeps John first without changing saved task order and collapses secondary details", () => {
    memory.tasks = [task({ id: "plain" }), task({ id: "review", risk: "yellow" })];
    render(<WorkBoard />);
    expect(Array.from(document.querySelectorAll('[id^="task-"]')).map((el) => el.id)).toEqual([
      "task-review",
      "task-plain",
    ]);
    expect(memory.tasks.map((t) => t.id)).toEqual(["plain", "review"]);
    expect(card("plain").querySelector("details")?.open).toBe(false);
    expect(within(card("review")).getByRole("button", { name: /Approve Task/ })).toBeTruthy();
  });

  // Saved order: ready, working, blocked, red, done, cancelled, yellow.
  // The board's existing sort (stable) puts tasks that need John (blocked = waiting,
  // yellow = unapproved yellow risk) first, then keeps saved order for the rest.
  const mixedTasks = () => [
    task({ id: "ready", title: "Ready job" }),
    task({ id: "working", status: "in_progress", title: "Assigned job" }),
    task({ id: "blocked", status: "waiting", title: "Waiting job" }),
    task({ id: "red", risk: "red", title: "Stopped job" }),
    task({ id: "done", status: "done", title: "Finished job" }),
    task({ id: "cancelled", status: "cancelled", title: "Cancelled job" }),
    task({ id: "yellow", risk: "yellow", title: "Approval job" }),
  ];
  const shownIds = () =>
    Array.from(document.querySelectorAll('[id^="task-"]')).map((el) => el.id.slice(5));
  const ACTIVE_ORDER = ["blocked", "yellow", "ready", "working", "red"];
  const HISTORY_ORDER = ["done", "cancelled"];

  it("filters saved states, preserves cancelled history and never writes on filter clicks", () => {
    memory.tasks = mixedTasks();
    render(<WorkBoard />);
    for (const [filter, ids] of [
      ["Ready", ["ready"]],
      ["Working", ["working"]],
      ["Blocked", ["blocked", "red"]],
      ["Done", ["done"]],
      ["Needs John", ["blocked", "yellow"]],
      ["History", HISTORY_ORDER],
      ["All", [...ACTIVE_ORDER, ...HISTORY_ORDER]],
      ["Active", ACTIVE_ORDER],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: filter }));
      expect(screen.getByRole("button", { name: filter }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      expect(shownIds()).toEqual(ids);
      expect(screen.queryByText("Buy a domain") !== null).toBe(
        filter === "Needs John" || filter === "All" || filter === "Active",
      );
    }
    expect(memory.tasks.map((t) => t.id)).toEqual([
      "ready",
      "working",
      "blocked",
      "red",
      "done",
      "cancelled",
      "yellow",
    ]);
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("opens on Active, switches to History and back, in priority order", () => {
    memory.tasks = mixedTasks();
    render(<WorkBoard />);
    // Active is the initial filter: unfinished tasks only, Needs John first.
    expect(screen.getByRole("button", { name: "Active" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
    expect(shownIds()).toEqual(ACTIVE_ORDER);
    expect(document.getElementById("task-done")).toBeNull();
    expect(document.getElementById("task-cancelled")).toBeNull();
    expect(screen.getByText("Buy a domain")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Active" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(shownIds()).toEqual(HISTORY_ORDER);
    for (const id of ACTIVE_ORDER) expect(document.getElementById(`task-${id}`)).toBeNull();
    expect(within(card("done")).getByText("Green — done")).toBeTruthy();
    expect(within(card("cancelled")).getByText("Grey — cancelled")).toBeTruthy();
    expect(screen.queryByText("Buy a domain")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(shownIds()).toEqual(ACTIVE_ORDER);
    expect(within(card("blocked")).getByText("John — review needed")).toBeTruthy();
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });

  it("shows empty History feedback when nothing is finished", () => {
    memory.tasks = [task({ id: "plain" })];
    memory.approvals = [];
    render(<WorkBoard />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("status").textContent).toBe("No tasks match History.");
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(shownIds()).toEqual(["plain"]);
  });

  it("shows empty filter feedback and leaves the controls available", () => {
    memory.tasks = [task({ id: "plain" })];
    memory.approvals = [];
    render(<WorkBoard />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("status").textContent).toBe("No tasks match Done.");
    expect(screen.getByRole("button", { name: "Needs John" })).toBeTruthy();
  });
});

describe("Work Board status colours", () => {
  it.each([
    [{ status: "open" }, "Grey — not started", "border-border"],
    [{ status: "in_progress" }, "Green — clear / assigned", "border-canx-green/60"],
    [{ status: "done" }, "Green — done", "border-canx-green/60"],
    [{ status: "waiting" }, "Yellow — waiting", "border-canx-yellow"],
    [{ status: "cancelled" }, "Grey — cancelled", "border-border"],
    [{ risk: "yellow" }, "Yellow — needs attention", "border-canx-yellow"],
    [{ updated_at: "2020-01-01T00:00:00Z" }, "Yellow — stale", "border-canx-yellow"],
    [{ risk: "red", status: "done" }, "Red — protected / integrity risk", "border-destructive"],
    [{ risk: "red", status: "waiting" }, "Red — protected / integrity risk", "border-destructive"],
    [
      { risk: "red", updated_at: "2020-01-01T00:00:00Z" },
      "Red — protected / integrity risk",
      "border-destructive",
    ],
  ] as [Partial<ManagerTask>, string, string][])(
    "shows %j with words and matching card colour",
    (over, label, border) => {
      memory = {
        ...memory,
        approvals: [],
        tasks: [task({ id: "original-id", updated_at: new Date().toISOString(), ...over })],
      };
      render(<WorkBoard />);
      // Done and cancelled tasks are listed under History, not the initial Active view.
      if (over.status === "done" || over.status === "cancelled") {
        expect(document.getElementById("task-original-id")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "History" }));
      }
      const item = card("original-id");
      expect(within(item).getByText(label)).toBeTruthy();
      expect(item.className).toContain(border);
      expect(item.className).toContain("[overflow-wrap:anywhere]");
      if (over.risk === "red") {
        expect(within(item).queryByRole("button", { name: /Approve/ })).toBeNull();
      }
      for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it("keeps long task content and existing IDs intact", () => {
    const title = "UnbrokenTitle".repeat(40);
    memory = { ...memory, approvals: [], tasks: [task({ id: "WB-10-21-2026-3", title })] };
    render(<WorkBoard />);
    expect(within(card("WB-10-21-2026-3")).getByText(title)).toBeTruthy();
    expect(memory.tasks[0]?.id).toBe("WB-10-21-2026-3");
  });
});
