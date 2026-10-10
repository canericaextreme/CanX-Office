// @vitest-environment happy-dom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const list = vi.fn(async () => []);
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => list }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture" }) }));
vi.mock("@/lib/office-files.functions", () => ({
  prepareOfficeUpload: {}, finishOfficeUpload: {}, listOfficeFiles: {}, openOfficeFile: {},
  officeUploadConnection: {}, saveOfficeLink: {}, deleteOfficeFile: {},
}));
import { OfficeFiles } from "./OfficeFiles";

afterEach(cleanup);

it.each(["brain", "legal"])("scopes the light upload palette when opened from %s", async (room) => {
  render(<OfficeFiles room={room} compact />);
  const trigger = screen.getByRole("button", { name: "Add files or photos" });
  expect(trigger.classList.contains("brain-upload-trigger")).toBe(room === "brain");
  fireEvent.click(trigger);
  await act(async () => {});
  const dialog = screen.getByRole("dialog", { name: "Add files, photos or videos" });
  expect(dialog.getAttribute("data-brain-upload")).toBe(room === "brain" ? "true" : null);
  expect(screen.getByRole("button", { name: "Choose from computer" })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "File in room" }) as HTMLSelectElement).value).toBe(room);
});
