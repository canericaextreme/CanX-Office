// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ManagerApproval } from "@/lib/manager-work.functions";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
import { ApprovalInbox } from "./ApprovalInbox";
const approvalAnchor = (id: string) => `approval-${id}`;

const pending: ManagerApproval = {
  id: "pending-1",
  owner_id: "owner",
  title: "Review the Office draft",
  detail: "Read the proposed change and its test evidence before deciding.",
  cost_cents: null,
  risk: "yellow",
  status: "pending",
  task_id: "task-1",
  created_at: "2026-10-18T02:00:00Z",
  decided_at: null,
};
const previous: ManagerApproval = {
  ...pending,
  id: "past-1",
  title: "Old decision",
  status: "approved",
};
afterEach(cleanup);

describe("owner approval inbox", () => {
  it("opens details without deciding, then sends only the explicit decision", () => {
    const onDecide = vi.fn(async () => {});
    render(
      <ApprovalInbox approvals={[pending, previous]} busy={null} canDecide onDecide={onDecide} />,
    );
    expect(screen.getByRole("heading", { name: "Needs your decision (1)" })).toBeTruthy();
    expect(screen.queryByText("Old decision")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open details: Review the Office draft" }));
    expect(screen.getByText(pending.detail)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Work Board" }).getAttribute("href")).toBe(
      "/work-board",
    );
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onDecide).toHaveBeenCalledExactlyOnceWith("pending-1", "declined");
  });
  it("makes past decisions readable without offering another approval", () => {
    render(<ApprovalInbox approvals={[previous]} busy={null} canDecide onDecide={vi.fn()} />);
    expect(screen.getByText(/Nothing is waiting/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show past decisions (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Open details: Old decision" }));
    expect(screen.getByText(previous.detail)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });
  it("opens and focuses the linked historical request without deciding", () => {
    const onDecide = vi.fn();
    render(
      <ApprovalInbox
        approvals={[pending, previous]}
        focusedId={approvalAnchor(previous.id)}
        busy={null}
        canDecide
        onDecide={onDecide}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Close details: Old decision" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(document.activeElement?.id).toBe(approvalAnchor(previous.id));
    expect(onDecide).not.toHaveBeenCalled();
  });
  it("disables decisions without owner verification and during a pending save", () => {
    const onDecide = vi.fn();
    const view = render(
      <ApprovalInbox
        approvals={[pending]}
        focusedId={approvalAnchor(pending.id)}
        busy={null}
        canDecide={false}
        onDecide={onDecide}
      />,
    );
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onDecide).not.toHaveBeenCalled();
    view.rerender(
      <ApprovalInbox
        approvals={[pending]}
        focusedId={approvalAnchor(pending.id)}
        busy={pending.id}
        canDecide
        onDecide={onDecide}
      />,
    );
    expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("shows the recorded outcome after refresh and removes decision buttons", () => {
    const onDecide = vi.fn(async () => {});
    const view = render(
      <ApprovalInbox
        approvals={[pending]}
        focusedId={approvalAnchor(pending.id)}
        busy={null}
        canDecide
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onDecide).toHaveBeenCalledExactlyOnceWith(pending.id, "approved");
    view.rerender(
      <ApprovalInbox
        approvals={[{ ...pending, status: "approved" }]}
        focusedId={approvalAnchor(pending.id)}
        busy={null}
        canDecide
        onDecide={onDecide}
      />,
    );
    expect(screen.getByText(/Decision recorded: approved/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
