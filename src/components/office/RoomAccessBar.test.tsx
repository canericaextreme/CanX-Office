// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { assembleSnapshot, roomTargetForRoute } from "@/lib/room-snapshot";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "/reception" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => read }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture" }) }));
vi.mock("@/lib/room-snapshot.functions", () => ({ getRoomSnapshot: "read" }));
vi.mock("@/lib/room-device-snapshot", () => ({ collectDeviceSnapshot: () => null }));
import { RoomAccessBar } from "./RoomAccessBar";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it.each(["reply", "throw"])("retains Reception's snapshot after %s refresh failure and recovers", async (failure) => {
  const snap = assembleSnapshot(roomTargetForRoute("/reception")!, [], "2026-10-24T17:29:22Z", "fixture-build");
  read.mockResolvedValueOnce({ ok: true, snapshot: snap });
  render(<RoomAccessBar />);
  await screen.findByText(/Saved-data readability:/);
  if (failure === "throw") read.mockRejectedValueOnce(new Error("offline"));
  else read.mockResolvedValueOnce({ ok: false, message: "Offline" });
  fireEvent.click(screen.getByLabelText("Refresh room check"));
  await screen.findByText(/Last snapshot retained from/);
  expect(screen.getByText(/Fresh read failed/).textContent).toContain("not fresh");
  expect(screen.getByRole("region").getAttribute("data-room-access")).toBe("error");
  fireEvent.click(screen.getByText("Sources"));
  expect(screen.getByText(/fixture-build/)).toBeTruthy();
  read.mockResolvedValueOnce({ ok: true, snapshot: { ...snap, checkedAt: "2026-10-24T18:00:00Z" } });
  fireEvent.click(screen.getByLabelText("Refresh room check"));
  await waitFor(() => expect(screen.queryByText(/Fresh read failed/)).toBeNull());
});
it("names a failed first read without inventing a retained snapshot", async () => {
  read.mockResolvedValue({ ok: false, message: "Offline" });
  render(<RoomAccessBar />);
  await screen.findByText(/No successful snapshot available/);
  expect(screen.queryByText("Sources")).toBeNull();
});
