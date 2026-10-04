// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** True when `a` comes before `b` in document order. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

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

  it("keeps the AI Workers card below the saved list and opens its historical details", () => {
    render(<Subscriptions />);
    const card = screen.getByRole("button", { name: "Open AI Workers subscription verification details" });
    expect(card.textContent).toContain("Historical snapshot from September 11, 2026. Current spend is unknown.");
    expect(before(screen.getByTestId("saved-list"), card)).toBe(true);

    fireEvent.click(card);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Current spend").nextElementSibling?.textContent).toBe("Unknown — not verified");
    expect(within(dialog).getByText("Historical snapshot — not current")).toBeTruthy();
    expect(within(dialog).queryByText("Previous provider records")).toBeNull();
  });
});
