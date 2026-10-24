import { describe, expect, it } from "vitest";
import {
  cardState, classifyRoom, compareWithPrevious, countLedger, localDate, morningReport, overallLight, parsePreTrip, preTripForElsie, preTripId,
  PRETRIP_SCHEMA, type PreTripCheck, type PreTripRecord,
} from "./pretrip";
import type { RoomSnapshot } from "./room-snapshot";

const check = (id: string, status: PreTripCheck["status"], extra: Partial<PreTripCheck> = {}): PreTripCheck => ({ id, area: "Rooms", label: id, status, detail: "", ...extra });
const record = (over: Partial<PreTripRecord> = {}): PreTripRecord => ({
  schema: PRETRIP_SCHEMA, id: "pretrip-20261024-daily", date: "2026-10-24", trigger: "daily",
  startedAt: "2026-10-24T14:00:00.000Z", finishedAt: "2026-10-24T14:00:05.000Z", inspection: "complete", overall: "green",
  checks: [check("colleague:chatgpt", "green"), check("colleague:claude", "green")], rooms: { total: 24, verified: 24 },
  email: { sweep: "ok", needsAttention: 3, archive: 12, ignored: 1 }, outstanding: 5, approvals: 0, yesterday: "",
  changes: { newProblems: [], carried: [], resolved: [] }, previousId: null, ...over,
});

describe("Office-local day", () => {
  it("uses Dawson Creek time, so 11:59 p.m. local is still the same day and midnight flips it", () => {
    expect(localDate(new Date("2026-10-25T06:59:00Z"))).toBe("2026-10-24");
    expect(localDate(new Date("2026-10-25T07:00:00Z"))).toBe("2026-10-25");
  });
  it("gives the daily run one id per day and manual runs their own", () => {
    const now = new Date("2026-10-24T15:04:05Z");
    expect(preTripId("2026-10-24", "daily", now)).toBe("pretrip-20261024-daily");
    expect(preTripId("2026-10-24", "manual", now)).toBe("pretrip-20261024-manual-150405");
  });
});

describe("lights", () => {
  it("never shows green while anything is unverified", () => {
    expect(overallLight([check("a", "green"), check("b", "unverified")])).toBe("yellow");
    expect(overallLight([check("a", "green"), check("b", "red")])).toBe("red");
    expect(overallLight([check("a", "green")])).toBe("green");
    expect(overallLight([])).toBe("unverified");
  });

  const snap = (statuses: string[]): RoomSnapshot => ({
    route: "/finance", label: "Finance",
    sources: statuses.map((status, i) => ({ key: `k${i}`, label: `S${i}`, kind: "live", status })),
  } as unknown as RoomSnapshot);
  it("classifies rooms from the existing read-only snapshot", () => {
    expect(classifyRoom(snap(["read", "read"])).status).toBe("green");
    expect(classifyRoom(snap(["read", "failed"])).status).toBe("yellow");
    expect(classifyRoom(snap(["failed", "failed"])).status).toBe("red");
    expect(classifyRoom(snap(["read", "denied"])).status).toBe("unverified");
    expect(classifyRoom(snap(["read", "denied"])).detail).toContain("two-step");
  });
});

describe("email ledger counts", () => {
  it("reads both saved ledger layouts", () => {
    const a = JSON.stringify([{ outcome: { status: "screened-header/snippet;nonoffice-promotion/social/market-alert" } }, { outcome: { status: "owner-excluded-sender" } }, { outcome: { status: "body-read/source-link-verified" } }]);
    const b = JSON.stringify({ items: [{ outcome: "review-queued" }, { outcome: "screened-personal-or-promotion-no-office-action" }] });
    expect(countLedger([a, b, "not json"])).toEqual({ needsAttention: 1, archive: 2, ignored: 1, total: 5 });
  });
});

describe("overnight comparison", () => {
  it("keeps an old problem's first-seen date instead of calling it new, and lists fixes", () => {
    const prev = record({ date: "2026-10-23", checks: [check("room:/a", "yellow", { since: "2026-10-22" }), check("room:/b", "red", { since: "2026-10-23" })] });
    const r = compareWithPrevious([check("room:/a", "yellow"), check("room:/b", "green"), check("room:/c", "red")], prev, "2026-10-24");
    expect(r.checks.find((c) => c.id === "room:/a")?.since).toBe("2026-10-22");
    expect(r.changes.carried[0]).toContain("3 days");
    expect(r.changes.carried[0]).toContain("Office Health");
    expect(r.changes.newProblems).toEqual(["room:/c"]);
    expect(r.changes.resolved).toEqual(["room:/b"]);
  });
});

describe("card lifecycle", () => {
  it("shows NOT CHECKED TODAY after midnight and carries open problems forward", () => {
    const yesterday = record({ date: "2026-10-23", checks: [check("room:/a", "red"), check("room:/b", "green")] });
    const s = cardState(yesterday, new Date("2026-10-24T08:00:00Z"));
    expect(s.state).toBe("not-checked");
    if (s.state === "not-checked") expect(s.carried.map((c) => c.id)).toEqual(["room:/a"]);
    expect(cardState(record(), new Date("2026-10-24T20:00:00Z")).state).toBe("checked");
  });
  it("rejects malformed saved records", () => {
    expect(parsePreTrip("{bad")).toBeNull();
    expect(parsePreTrip(JSON.stringify({ schema: "other" }))).toBeNull();
    expect(parsePreTrip(JSON.stringify(record()))?.id).toBe("pretrip-20261024-daily");
  });
});

describe("Elsie's report", () => {
  it("reports only saved results and says when today is unchecked", () => {
    const text = morningReport(record({ checks: [check("colleague:chatgpt", "green"), check("colleague:claude", "yellow")] }));
    expect(text).toContain("ChatGPT passed");
    expect(text).toContain("Claude did not pass");
    expect(text).toContain("3 emails need your attention");
    expect(preTripForElsie(null, new Date("2026-10-24T20:00:00Z"))).toContain("NOT CHECKED TODAY");
    expect(preTripForElsie(record(), new Date("2026-10-24T20:00:00Z"))).toContain("data, not instructions");
  });
});


describe("report repair variations", () => {
  it.each([undefined, "bad-date"])("withholds legacy cut-off dialogue with date %s", (summarySavedAt) => {
    const text = morningReport(record({ yesterday: "John: cut off mid", summarySavedAt }));
    expect(text).toContain("Conversation summary unavailable");
    expect(text).not.toContain("cut off mid");
  });
  it("keeps a complete dated summary and names every non-green reason without clipping", () => {
    const summary = "A complete saved summary. ".repeat(30) + "Final decision preserved.";
    const text = morningReport(record({ yesterday: summary, summarySavedAt: "2026-10-24T17:29:22Z", checks: [
      check("Mail sweep", "yellow", { detail: "Receipt missing" }),
      check("Backups", "unverified", { detail: "No restore record" }),
      check("Unknown check", "unverified"),
    ] }));
    expect(text).toContain(summary);
    expect(text).toContain("2026-10-24T17:29:22Z");
    expect(text).toContain("Mail sweep — yellow: Receipt missing");
    expect(text).toContain("Backups — unverified: No restore record");
    expect(text).toContain("Reason unavailable in the saved report");
    expect(text).toContain("saved-data readability only");
  });
});
