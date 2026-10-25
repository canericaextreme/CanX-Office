import { describe, it, expect } from "vitest";
import {
  DAY,
  REQUESTED_START,
  elapsed,
  summarize,
  validRecord,
  dayKey,
  settings,
  type HoursRecord,
} from "./office-hours";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const t = REQUESTED_START;
const span = (n: number, start: number, end: number, activeEnd = end): HoursRecord => ({
  id: id(n),
  type: "elapsed",
  start,
  end,
  activeEnd,
});
describe("Office Hours elapsed evidence", () => {
  it("starts at actual activation, never the requested date retroactively", () => {
    expect(elapsed(t - 1, t + 1000, t, 5, false)).toBeNull();
    expect(elapsed(t + DAY, t + DAY + 10000, t + DAY, 5, false)).toMatchObject({
      start: t + DAY,
      end: t + DAY + 10000,
    });
  });
  it("cuts active time at the idle threshold while preserving open time", () => {
    expect(elapsed(t + 295000, t + 305000, t, 5, false)).toMatchObject({ activeEnd: t + 300000 });
    expect(elapsed(t + 600000, t + 610000, t, 5, false)).toMatchObject({ activeEnd: t + 600000 });
  });
  it("includes ongoing voice without clicks and excludes suspended and backwards clocks", () => {
    expect(elapsed(t + 600000, t + 610000, t, 5, true)?.activeEnd).toBe(t + 610000);
    expect(elapsed(t, t + 31000, t, 5, true)).toBeNull();
    expect(elapsed(t, t - 1, t, 5, false)).toBeNull();
  });
  it("unions overlaps and retries across tabs/devices separately for active time", () => {
    const records = [span(1, t, t + 20000, t + 10000), span(2, t + 5000, t + 25000, t + 15000)];
    const b = summarize([...records, ...records], "day")[0]!;
    expect(b.open * 3600000).toBeCloseTo(25000);
    expect(b.active * 3600000).toBeCloseTo(15000);
  });
  it("splits Dawson Creek midnight and Monday/week and month boundaries", () => {
    const start = Date.parse("2026-11-01T06:59:50Z");
    const r = span(1, start, start + 20000);
    expect(summarize([r], "day").map((b) => b.label)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(summarize([r], "month").map((b) => b.label)).toEqual(["2026-10", "2026-11"]);
    expect(summarize([r], "week")[0]?.label).toBe("2026-10-26");
  });
  it("reconciles global pause/resume over late device uploads", () => {
    const records: HoursRecord[] = [
      span(1, t, t + 30000),
      { id: id(2), type: "control", at: t + 10000, paused: true, idleMinutes: 5 },
      { id: id(3), type: "control", at: t + 20000, paused: false, idleMinutes: 10 },
    ];
    expect(summarize(records, "day")[0]!.open * 3600000).toBeCloseTo(20000);
    expect(settings(records)).toMatchObject({ paused: false, idleMinutes: 10 });
  });
  it("keeps corrections separate and does not invent pre-activation hours", () => {
    const records: HoursRecord[] = [
      span(1, t + DAY, t + DAY + 10000),
      {
        id: id(2),
        type: "correction",
        at: t + 2 * DAY,
        day: dayKey(t),
        openMinutes: 60,
        activeMinutes: 10,
        reason: "Earlier unsupported time",
      },
      {
        id: id(3),
        type: "correction",
        at: t + 2 * DAY,
        day: dayKey(t + DAY),
        openMinutes: 10,
        activeMinutes: 5,
        reason: "Observed missed time",
      },
    ];
    const b = summarize(records, "day")[0]!;
    expect(b.correctionOpen).toBeCloseTo(1 / 6);
    expect(b.open * 3600000).toBeCloseTo(10000);
    expect(b.runningOpen).toBeCloseTo(b.open + 1 / 6);
  });
  it("rejects malformed, excessive, future and invalid-date evidence", () => {
    expect(validRecord(span(1, t, t + 10000), t + 10000)).toBe(true);
    expect(validRecord(span(1, t, t + 40000), t + 40000)).toBe(false);
    expect(validRecord(span(1, t, t + 10000), t - 40000)).toBe(false);
    expect(
      validRecord(
        {
          id: id(1),
          type: "correction",
          at: t,
          day: "2026-02-31",
          openMinutes: 1,
          activeMinutes: 0,
          reason: "x",
        },
        t,
      ),
    ).toBe(false);
  });
});
