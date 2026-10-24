// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "/reception" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => list }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture", canReadProtected: true }) }));
vi.mock("@/lib/records.functions", () => ({ listSharedNotes: "list" }));
import { roomReportSource } from "@/lib/manager-room-commands";
import { RoomReports } from "./RoomReports";
afterEach(cleanup);
it("shows each saved report ID once and preserves distinct reports with the same title", async () => {
  const note = { id: "report-1", title: "Walk-around", detail: "Report one", source: roomReportSource("reception"), createdAt: "2026-10-24T17:29:22Z" };
  list.mockResolvedValue({ ok: true, data: [note, note, { ...note, id: "report-2", detail: "Report two" }, { ...note, id: "elsewhere", source: roomReportSource("brain") }] });
  render(<RoomReports />);
  await screen.findByText("Report one");
  expect(screen.getAllByText("Report one")).toHaveLength(1);
  expect(screen.getAllByText("Walk-around")).toHaveLength(2);
  expect(screen.getByText("Report two")).toBeTruthy();
});
