// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mock = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  session: { accessToken: "t", viewer: false },
  path: "/owner-desk",
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: mock.path } }),
  useRouter: () => ({ routesByPath: {} }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => mock.session }));
vi.mock("@/lib/room-layout.functions", () => ({
  getRoomLayout: mock.read,
  saveRoomLayout: mock.save,
}));

import { RoomBox, RoomEditTab } from "./RoomLayout";
import { RoomLayoutProvider } from "./RoomLayoutProvider";

function Room() {
  return (
    <RoomLayoutProvider>
      <RoomEditTab />
      <div data-testid="shelf">
        <RoomBox id="owner-desk.priorities" name="Today's priorities">
          <section>
            <h2>Today's priorities</h2>
            <p>Task list</p>
          </section>
        </RoomBox>
        <RoomBox id="owner-desk.budget" name="AI budget">
          <section>
            <h2>AI budget</h2>
          </section>
        </RoomBox>
      </div>
    </RoomLayoutProvider>
  );
}

const read = (b: Record<string, unknown> = {}) => ({
  ok: true,
  read: { layout: { v: 1, b }, history: { v: 1, h: [] }, version: JSON.stringify({ v: 1, b }) },
});

beforeEach(() => {
  mock.session = { accessToken: "t", viewer: false };
  mock.path = "/owner-desk";
  mock.read.mockReset().mockResolvedValue(read());
  mock.save.mockReset();
});
afterEach(cleanup);

it("locked by default: boxes draw exactly their contents with no controls", async () => {
  render(<Room />);
  await waitFor(() => expect(mock.read).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /Edit/ }).textContent).toContain("Locked");
  expect(screen.getByText("Task list")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Rename/ })).toBeNull();
});

it("the tab opens Unlock, Edit and Lock; Unlock shows controls and Lock hides them", async () => {
  render(<Room />);
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  expect(screen.getByRole("menuitem", { name: /Unlock/ })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: /^.*Edit list/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: /Unlock/ }));
  expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Lock/ }));
  expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
});

it("moving a box to another room saves only where it lives and hides it here once saved", async () => {
  mock.save.mockResolvedValue({
    ok: true,
    message: "Saved and checked.",
    read: read({ "owner-desk.budget": { r: "/finance", o: 9000 } }).read,
  });
  render(<Room />);
  await waitFor(() => expect(mock.read).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Unlock/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "Move AI budget to another room" }), {
    target: { value: "/finance" },
  });
  await waitFor(() => expect(mock.save).toHaveBeenCalled());
  expect(mock.save.mock.calls[0]![0].data).toMatchObject({
    after: { "owner-desk.budget": { r: "/finance", o: 9000 } },
    what: 'Moved "AI budget" to Finance',
    expectedVersion: JSON.stringify({ v: 1, b: {} }),
  });
  await waitFor(() => expect(screen.getByText(/now lives in/)).toBeTruthy());
  expect(screen.getByRole("button", { name: "Bring it back here" })).toBeTruthy();
  // Locked again, the moved box is simply not in this room.
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Lock/ }));
  expect(screen.queryByText("AI budget")).toBeNull();
});

it("a saved name shows on the box's own heading without changing its contents", async () => {
  mock.read.mockResolvedValue(read({ "owner-desk.priorities": { n: "My list" } }));
  render(<Room />);
  await waitFor(() =>
    expect(document.querySelector('[data-canx-renamed="My list"]')).not.toBeNull(),
  );
  expect(document.querySelector("[data-canx-renamed]")?.tagName).toBe("H2");
  expect(screen.getByText("Task list")).toBeTruthy();
});

it("an assistant viewer sees the tab but cannot unlock", async () => {
  mock.session = { accessToken: "t", viewer: true };
  render(<Room />);
  fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  expect((screen.getByRole("menuitem", { name: /Unlock/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(mock.read).not.toHaveBeenCalled();
});

it("shows no tab on the office map", () => {
  mock.path = "/";
  render(<Room />);
  expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
});
