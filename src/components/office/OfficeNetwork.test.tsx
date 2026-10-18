// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OfficeNetwork } from "./OfficeNetwork";
import { startActivity, updateActivityRoom } from "@/lib/office-activity-log";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";
import { MANAGER_HANDOFF_EVENT } from "@/lib/companion-bridge";
vi.mock("@/lib/office-theme", () => ({ useReducedMotion: () => true }));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it("renders all rooms, updates on actual activity, respects reduced motion and prepares an unsent narration", () => {
  render(<OfficeNetwork />);
  expect(screen.getAllByRole("link")).toHaveLength(OFFICE_ROOM_IDENTITIES.length);
  act(() => {
    startActivity({
      taskId: "real",
      title: "Private task title",
      roomId: "brain",
      stage: "brainstorming",
    });
    updateActivityRoom("real", "systems", "building");
  });
  expect(screen.getByRole("img").querySelector("animateMotion")).toBeNull();
  expect(screen.getByRole("img").querySelector("animate")).toBeNull();
  const handoff = vi.fn();
  window.addEventListener(MANAGER_HANDOFF_EVENT, handoff);
  fireEvent.click(screen.getByRole("button", { name: "Prepare Elsie narration" }));
  expect(handoff).toHaveBeenCalledOnce();
  const event = handoff.mock.calls[0]![0] as CustomEvent<{ text: string }>;
  expect(event.detail.text).toContain("1 recorded handoffs");
  expect(event.detail.text).not.toContain("Private task title");
  window.removeEventListener(MANAGER_HANDOFF_EVENT, handoff);
});
it("draws static graphs with truthful empty readings", () => {
  render(<OfficeNetwork graphs />);
  expect(screen.getAllByRole("img")[0]!.getAttribute("aria-label")).toContain(
    `unknown: ${OFFICE_ROOM_IDENTITIES.length} rooms`,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getAllByRole("img")[0]!.querySelector("animateMotion")).toBeNull();
});
