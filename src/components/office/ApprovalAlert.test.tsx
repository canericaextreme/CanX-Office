// @vitest-environment happy-dom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({
  requests: [{ id: "first", status: "pending" }],
  refresh: vi.fn(),
}));
vi.mock("@/lib/use-manager-memory", () => ({
  useManagerMemory: () => ({ memory: { approvals: state.requests }, refresh: state.refresh }),
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/reception" }),
  Link: ({ to, hash, children }: { to: string; hash?: string; children: React.ReactNode }) => (
    <a href={`${to}${hash ? `#${hash}` : ""}`}>{children}</a>
  ),
}));
import { ApprovalAlert } from "./ApprovalAlert";
afterEach(cleanup);
describe("approval review notification", () => {
  it("opens the actual waiting request and does not hide a new request with the same count", () => {
    state.requests = [{ id: "first", status: "pending" }];
    const view = render(<ApprovalAlert />);
    expect(screen.getByRole("link", { name: "Open review" }).getAttribute("href")).toBe(
      "/approvals#approval-first",
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide the approval notice" }));
    expect(screen.queryByRole("link", { name: "Open review" })).toBeNull();
    state.requests = [{ id: "second", status: "pending" }];
    view.rerender(<ApprovalAlert />);
    expect(screen.getByRole("link", { name: "Open review" }).getAttribute("href")).toBe(
      "/approvals#approval-second",
    );
  });
  it("does not announce old decisions as waiting", () => {
    state.requests = [{ id: "old", status: "approved" }];
    render(<ApprovalAlert />);
    expect(screen.queryByRole("link", { name: "Open review" })).toBeNull();
  });
});
