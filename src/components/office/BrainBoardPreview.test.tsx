// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleSnapshot, ROOM_TARGETS } from "@/lib/room-snapshot";
import { BrainBoardPreview } from "./BrainBoardPreview";
const mocks = vi.hoisted(() => ({ token: "owner-session", read: vi.fn() }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: mocks.token }) }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => mocks.read,
  createServerFn: () => ({ inputValidator: () => ({ handler: () => vi.fn() }) }),
}));
vi.mock("@/lib/room-snapshot.functions", () => ({ getRoomSnapshot: vi.fn() }));
vi.mock("@/lib/office-health", () => ({ currentBuildVersion: () => "test-build" }));
afterEach(cleanup);
beforeEach(() => {
  mocks.token = "owner-session";
  mocks.read.mockReset();
});
describe("brain board draft preview", () => {
  it("starts with explicit demo data and makes no automatic reads", () => {
    render(<BrainBoardPreview />);
    expect(screen.getByRole("status").textContent).toContain("demo data");
    expect(screen.getByText(/three.js board is still pending/)).toBeTruthy();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("shows actual empty counts, partial and denied sources without inventing activity", async () => {
    const snapshot = assembleSnapshot(
      ROOM_TARGETS[0]!,
      [
        {
          key: "files",
          label: "Saved files",
          kind: "live",
          status: "read",
          count: 0,
          items: [],
          latestAt: null,
          detail: "",
        },
        {
          key: "reports",
          label: "Room reports",
          kind: "live",
          status: "denied",
          count: null,
          items: [],
          latestAt: null,
          detail: "",
        },
      ],
      "2026-10-19T12:00:00Z",
      "test-build",
    );
    mocks.read.mockResolvedValue({ ok: true, snapshot });
    const view = render(<BrainBoardPreview />);
    fireEvent.click(screen.getByRole("button", { name: "Read selected room" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1 rooms with data read"),
    );
    expect(screen.getByText(/Saved files: Office · read · 0 records/)).toBeTruthy();
    expect(screen.getByText(/Room reports: Office · denied/)).toBeTruthy();
    expect(screen.getByText(/Activity: demo data/)).toBeTruthy();
    mocks.token = "";
    view.rerender(<BrainBoardPreview />);
    expect(screen.queryByText(/0 records/)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("No Office room data");
  });
  it("discloses a failed read and keeps demo labels", async () => {
    mocks.read.mockRejectedValue(new Error("offline"));
    render(<BrainBoardPreview />);
    fireEvent.click(screen.getByRole("button", { name: "Read selected room" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Room read failed"),
    );
    expect(screen.getByRole("status").textContent).toContain("demo data");
  });
});
