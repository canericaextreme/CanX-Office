// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REQUESTED_START, summarize, type HoursRecord } from "@/lib/office-hours";
const mock = vi.hoisted(() => ({
  session: { stepUpComplete: true, viewer: false, ownerId: "owner", accessToken: "fixture" },
  sync: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mock.sync }));
vi.mock("@/lib/office-hours.functions", () => ({ syncOfficeHours: () => undefined }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => mock.session }));
import {
  OfficeHoursProvider,
  OfficeHoursPanel,
  OfficeHoursView,
  OFFICE_HOURS_VOICE,
} from "./OfficeHours";
const mount = () =>
  render(
    <OfficeHoursProvider>
      <OfficeHoursPanel />
    </OfficeHoursProvider>,
  );
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
};
const saved: HoursRecord[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(REQUESTED_START + 86400000);
  localStorage.clear();
  saved.length = 0;
  mock.session.stepUpComplete = true;
  mock.session.viewer = false;
  mock.sync
    .mockReset()
    .mockImplementation(async ({ data }: { data: { records: HoursRecord[] } }) => {
      for (const r of data.records) if (!saved.some((s) => s.id === r.id)) saved.push(r);
      return { ok: true, records: [...saved] };
    });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Office-wide recording and persistence", () => {
  it("waits for initial shared read, records elapsed time and confirms a durable save", async () => {
    mount();
    await settle();
    await advance(10000);
    expect(localStorage.length).toBe(1);
    expect(screen.getByRole("status").textContent).toContain("pending");
    await advance(50000);
    expect(saved.filter((r) => r.type === "elapsed").length).toBe(5);
    expect(localStorage.length).toBe(1);
    expect(screen.getByRole("status").textContent).toContain("confirmed");
  });
  it("recovers pending elapsed intervals after reload without counting closed time", async () => {
    let view = mount();
    await settle();
    await advance(10000);
    view.unmount();
    vi.setSystemTime(Date.now() + 3600000);
    view = mount();
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: "elapsed", end: REQUESTED_START + 86410000 });
    await advance(10000);
    expect(localStorage.length).toBe(1);
  });
  it("retains pending records on failed saves and retries identical ids", async () => {
    mount();
    await settle();
    mock.sync.mockResolvedValue({ ok: false, message: "Offline — pending" });
    await advance(60000);
    expect(localStorage.length).toBe(6);
    const ids = Array.from(
      { length: localStorage.length },
      (_, i) => JSON.parse(localStorage.getItem(localStorage.key(i)!)!).id,
    );
    mock.sync.mockImplementation(async ({ data }: { data: { records: HoursRecord[] } }) => ({
      ok: true,
      records: data.records,
    }));
    await advance(60000);
    const submitted = mock.sync.mock.calls.at(-1)![0].data.records as HoursRecord[];
    expect(ids.every((id) => submitted.some((r) => r.id === id))).toBe(true);
    expect(localStorage.length).toBe(1);
  });
  it("preserves voice activity after the click idle threshold", async () => {
    mount();
    await settle();
    await advance(310000);
    window.dispatchEvent(new CustomEvent(OFFICE_HOURS_VOICE, { detail: true }));
    await advance(10000);
    const pending = Array.from({ length: localStorage.length }, (_, i) =>
      JSON.parse(localStorage.getItem(localStorage.key(i)!)!),
    );
    expect(pending.at(-1).activeEnd).toBe(pending.at(-1).end);
    expect(saved.some((r) => r.type === "elapsed" && r.activeEnd === r.start)).toBe(false);
  });
  it("pauses, resumes and saves the visible idle threshold", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Pause tracking" }));
    await advance(20000);
    expect(screen.getByRole("button", { name: "Resume tracking" })).toBeTruthy();
    expect(localStorage.length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Resume tracking" }));
    fireEvent.change(screen.getByLabelText("Idle threshold (minutes)"), {
      target: { value: "10" },
    });
    await advance(10000);
    expect(localStorage.length).toBe(4);
  });
  it("saves a reasoned manual correction without changing measured sessions", async () => {
    mount();
    await settle();
    await advance(10000);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-25" } });
    fireEvent.change(screen.getByLabelText("Open adjustment (minutes)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Active adjustment (minutes)"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Observed missed voice work" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save correction" }).closest("form")!);
    const rows = Array.from({ length: localStorage.length }, (_, i) =>
      JSON.parse(localStorage.getItem(localStorage.key(i)!)!),
    );
    expect(rows.find((r) => r.type === "correction")).toMatchObject({
      openMinutes: 5,
      activeMinutes: 3,
      reason: "Observed missed voice work",
    });
    expect(rows.filter((r) => r.type === "elapsed")).toHaveLength(1);
  });
  it("shows unavailable totals and never starts recording if initial history cannot load", async () => {
    mock.sync.mockResolvedValue({ ok: false, message: "History unavailable" });
    mount();
    await settle();
    await advance(60000);
    expect(screen.getByText(/Totals unavailable/)).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });
  it("denies viewers and sessions without MFA without calling shared storage", async () => {
    mock.session.viewer = true;
    mount();
    await advance(60000);
    expect(mock.sync).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    cleanup();
    mock.session.viewer = false;
    mock.session.stepUpComplete = false;
    mount();
    await advance(60000);
    expect(mock.sync).not.toHaveBeenCalled();
  });
  it("handles two simultaneous tabs with immutable queues and deduplicated totals", async () => {
    mount();
    mount();
    await settle();
    await advance(10000);
    expect(localStorage.length).toBe(2);
    await advance(50000);
    expect(saved.length).toBe(10);
    expect(summarize(saved, "day")[0]!.open * 3600000).toBeCloseTo(50000);
    expect(screen.getAllByText("Measured Office-open time")).toHaveLength(2);
  });
});
describe.each([390, 1440])(
  "Analytics display at %ipx (DOM fixture, not browser layout)",
  (width) => {
    it("shows charts, separate estimates, controls, totals and manual correction history", () => {
      window.innerWidth = width;
      const start = REQUESTED_START + 86400000;
      const add = vi.fn();
      render(
        <OfficeHoursView
          loaded={true}
          records={[
            {
              id: "00000000-0000-4000-8000-000000000001",
              type: "elapsed",
              start,
              end: start + 10000,
              activeEnd: start + 5000,
            },
            {
              id: "00000000-0000-4000-8000-000000000002",
              type: "correction",
              at: start + 10000,
              day: "2026-10-25",
              openMinutes: 5,
              activeMinutes: 2,
              reason: "Recovered observed voice work",
            },
          ]}
          message="Draft fixture"
          pending={0}
          add={add}
          period="day"
          setPeriod={vi.fn()}
          error=""
          setError={vi.fn()}
        />,
      );
      expect(screen.getByRole("table")).toBeTruthy();
      expect(screen.getByText("Estimated active working time")).toBeTruthy();
      expect(screen.getByText(/Recovered observed voice work/)).toBeTruthy();
      expect(screen.getByLabelText("Chart period")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Save correction" })).toBeTruthy();
      expect(screen.getByText(/Actual activation/).textContent).toContain("2026-10-25");
    });
  },
);
