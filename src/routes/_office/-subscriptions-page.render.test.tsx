// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock factories run before the test file's own imports, so React is loaded
// inside each factory rather than referenced from module scope.
vi.mock("@/components/office/RoomShell", async () => {
  const React = await import("react");
  return {
    RoomShell: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "room-shell" }, children),
  };
});
vi.mock("@/components/office/SubscriptionManager", async () => {
  const React = await import("react");
  return {
    SubscriptionManager: () => React.createElement("div", { "data-testid": "saved-list" }, "SAVED SUBSCRIPTION LIST"),
  };
});

import { Subscriptions } from "@/routes/_office/subscriptions";

afterEach(cleanup);

describe("Subscriptions page render", () => {
  it("renders the saved list without the static provider-records card", () => {
    const { container } = render(<Subscriptions />);
    expect(screen.getByTestId("saved-list")).toBeTruthy();
    // The removed card: heading, explanatory note and its three static rows.
    expect(screen.queryByText("Previous provider records")).toBeNull();
    expect(container.textContent).not.toContain("Static historical notes");
    expect(screen.queryByText("Email sending")).toBeNull();
    expect(screen.queryByText("Supabase")).toBeNull();
  });

  it("renders no AI Workers historical snapshot card", () => {
    const { container } = render(<Subscriptions />);
    expect(screen.queryByRole("button", { name: "Open AI Workers subscription verification details" })).toBeNull();
    expect(container.textContent).not.toContain("AI Workers");
    expect(container.textContent).not.toContain("Historical snapshot");
    expect(container.textContent).not.toContain("September 11, 2026");
  });
});
