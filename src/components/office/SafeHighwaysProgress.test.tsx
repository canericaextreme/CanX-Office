// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ManagerTask } from "@/lib/manager-work.functions";

const session = { state: "owner", accessToken: "token", viewer: false };
const load = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => load }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => session }));
vi.mock("@/lib/safe-highways-progress.functions", () => ({ getSafeHighwaysProgress: vi.fn() }));
import { SafeHighwaysProgress } from "./SafeHighwaysProgress";

const task: ManagerTask = {
  id: "43da2350-e1aa-4d22-a1da-9885295888be",
  owner_id: "owner",
  title: "Safe Highways — independent operation and Analytics progress",
  detail: "Inventory scope",
  status: "in_progress",
  worker: "Codex",
  risk: "green",
  result: "",
  evidence: "",
  created_at: "2026-10-20T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
};
beforeEach(() => {
  session.state = "owner";
  session.viewer = false;
  load.mockReset();
  load.mockResolvedValue({ ok: true, task });
});
afterEach(cleanup);
describe("shared assignment display", () => {
  it.each(["room", "analytics"] as const)("shows truthful initial state in %s", async (variant) => {
    render(<SafeHighwaysProgress variant={variant} />);
    await screen.findByText(task.title);
    expect(screen.getByText(/Inventory begun/)).toBeTruthy();
    expect(screen.getByText(/Assigned — activity unconfirmed/)).toBeTruthy();
    expect(screen.getByText(/Not performed in the initial owner report/)).toBeTruthy();
    expect(
      screen.getByText(/Migration job: none running in the initial owner report/),
    ).toBeTruthy();
    expect(screen.getByText(/Task update time is not verification/)).toBeTruthy();
    expect(screen.getByText("No supporting evidence recorded.")).toBeTruthy();
  });
  it("renders recorded milestones, evidence, verification, blocker and next action after refresh", async () => {
    render(<SafeHighwaysProgress />);
    await screen.findByText(task.title);
    load.mockResolvedValue({
      ok: true,
      task: {
        ...task,
        waiting_reason: "Device required",
        evidence: "Inventory list captured",
        result:
          "Milestone: Inventory reviewed\nLast verified: 2026-10-25T12:00:00Z\nNext action: Test on device\nAcceptance tests: Pending device",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh assignment" }));
    await screen.findByText("Inventory reviewed");
    for (const value of [
      "Inventory list captured",
      "2026-10-25T12:00:00Z",
      "Device required",
      "Test on device",
      "Pending device",
    ])
      expect(screen.getByText(value)).toBeTruthy();
  });
  it("does not read or show task data signed out or as a viewer", async () => {
    session.state = "signed-out";
    const view = render(<SafeHighwaysProgress />);
    expect(load).not.toHaveBeenCalled();
    session.state = "owner";
    session.viewer = true;
    view.rerender(<SafeHighwaysProgress />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByText(task.title)).toBeNull();
  });
  it("hides loaded data immediately on sign-out", async () => {
    const view = render(<SafeHighwaysProgress />);
    await screen.findByText(task.title);
    session.state = "signed-out";
    view.rerender(<SafeHighwaysProgress />);
    expect(screen.queryByText(task.title)).toBeNull();
  });
  it("shows failed reads without claiming initial progress", async () => {
    load.mockRejectedValue(new Error("offline"));
    render(<SafeHighwaysProgress />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Progress is unavailable"),
    );
    expect(screen.queryByText(/Inventory begun/)).toBeNull();
  });
});
