// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/office/RoomShell", () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <div data-testid="room-shell">{children}</div>,
}));
vi.mock("@/components/office/SubscriptionManager", () => ({
  SubscriptionManager: () => <div data-testid="saved-list">SAVED SUBSCRIPTION LIST</div>,
}));

import { Route } from "@/routes/_office/subscriptions";

const Page = Route.options.component as () => React.ReactElement;

afterEach(cleanup);

/** True when `a` comes before `b` in document order. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Subscriptions page render", () => {
  it("renders the saved list without the static provider-records card", () => {
    const { container } = render(<Page />);
    expect(screen.getByTestId("saved-list")).toBeTruthy();
    // The removed card: heading, explanatory note and its three static rows.
    expect(screen.queryByText("Previous provider records")).toBeNull();
    expect(container.textContent).not.toContain("Static historical notes");
    expect(screen.queryByText("Email sending")).toBeNull();
    expect(screen.queryByText("Supabase")).toBeNull();
  });

  it("keeps the AI Workers card below the saved list and opens its historical details", () => {
    render(<Page />);
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
