// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { saveRoomNoteWith } from "@/lib/room-note-save.server";
import { fixture, note } from "../../../tests/room-note-fixture";
import { RoomReports } from "./RoomReports";
import type { OfficeNote } from "@/lib/office-notes";
const mock = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  session: { accessToken: "test", canReadProtected: true, shared: true, viewer: false },
  path: "/systems",
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: mock.path } }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => mock.session }));
vi.mock("@/lib/records.functions", () => ({
  listSharedNotes: mock.list,
  saveSharedRoomNote: mock.save,
}));
let store: ReturnType<typeof fixture>;
beforeEach(() => {
  store = fixture();
  mock.path = "/systems";
  mock.session.shared = true;
  mock.session.viewer = false;
  mock.list.mockImplementation(async ({ data }) => ({
    ok: true,
    data: [...store.data.values()]
      .filter(
        (row) => row["source"] === data.source && (!data.title || row["title"] === data.title),
      )
      .map((row) => ({ ...note, ...row })),
  }));
  mock.save.mockImplementation(
    async ({ data }: { data: { note: OfficeNote; previous: OfficeNote | null } }) => {
      try {
        return {
          ok: true,
          data: await saveRoomNoteWith(store.rest, "owner", data.note, data.previous),
        };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
  );
});
afterEach(cleanup);
it("edits a saved note through the room UI and loads persisted content on remount", async () => {
  const view = render(<RoomReports />);
  fireEvent.click(await screen.findByText("Edit note"));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated review" } });
  fireEvent.change(screen.getByLabelText("Note"), {
    target: { value: "Saved content after reload" },
  });
  fireEvent.click(screen.getByText("Save note"));
  await screen.findByText("Saved and re-read from the CanX account.");
  view.unmount();
  render(<RoomReports />);
  expect(await screen.findByText("Updated review")).toBeTruthy();
  expect(screen.getByText("Saved content after reload")).toBeTruthy();
});
it("files an existing note to the destination room, then reloads it there", async () => {
  const view = render(<RoomReports />);
  fireEvent.click(await screen.findByText("Edit note"));
  fireEvent.change(screen.getByLabelText("Destination room"), {
    target: { value: "Data room report: legal" },
  });
  fireEvent.click(screen.getByText("Save note"));
  await screen.findByText("Saved and re-read from the CanX account.");
  await waitFor(() => expect(screen.queryByText("Security review")).toBeNull());
  view.unmount();
  mock.path = "/legal";
  render(<RoomReports />);
  expect(await screen.findByText("Security review")).toBeTruthy();
});
it("creates the Security checklist and persists all four groups after reload", async () => {
  const view = render(<RoomReports securityOnly />);
  fireEvent.click(await screen.findByText("Start Security checklist"));
  for (const [stage, value] of [
    ["Complete", "Reviewed"],
    ["Currently working", "Reviewing"],
    ["Needs testing", "Phone reload"],
    ["Needs improvement", "Labels"],
  ] as const) {
    fireEvent.change(screen.getByLabelText(stage), { target: { value } });
  }
  fireEvent.click(screen.getByText("Save note"));
  await screen.findByText("Saved and re-read from the CanX account.");
  view.unmount();
  render(<RoomReports securityOnly />);
  expect(await screen.findByText("Phone reload")).toBeTruthy();
  for (const value of ["Reviewed", "Reviewing", "Labels"])
    expect(screen.getByText(value)).toBeTruthy();
});
it("keeps unsaved edits visible and reports a persistence failure", async () => {
  render(<RoomReports />);
  fireEvent.click(await screen.findByText("Edit note"));
  store.state.failRead = true;
  fireEvent.click(screen.getByText("Save note"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "persistence could not be confirmed",
  );
  expect(screen.getByLabelText("Note")).toBeTruthy();
  expect(screen.queryByText("Saved and re-read from the CanX account.")).toBeNull();
});
it("offers no edit or create controls to read-only viewers", async () => {
  mock.session.shared = false;
  mock.session.viewer = true;
  render(<RoomReports />);
  await screen.findByText("Security review");
  expect(screen.queryByText("Edit note")).toBeNull();
  expect(screen.queryByText("Add room note")).toBeNull();
});
