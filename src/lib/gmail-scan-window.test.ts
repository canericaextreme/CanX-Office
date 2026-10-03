import { describe, expect, it } from "vitest";
import { cleanGmailScanConfig, datedGmailQuery, localDayStart, validScanDate } from "./gmail-scan-window";

describe("dated Gmail scan window", () => {
  it("includes the full August 15 Whitehorse day with strict Gmail epoch boundaries", () => {
    const start = localDayStart("2026-08-15");
    expect(start?.toISOString()).toBe("2026-08-15T07:00:00.000Z");
    const query = datedGmailQuery("(receipt OR invoice) newer_than:1y -in:spam", "2026-08-15", "2026-10-03T23:48:12.600Z");
    expect(query).toContain(`after:${Math.floor(Date.parse("2026-08-15T07:00:00.000Z") / 1000) - 1}`);
    expect(query).toContain(`before:${Math.floor(Date.parse("2026-10-03T23:48:12.600Z") / 1000) + 1}`);
    expect(query).not.toContain("newer_than:1y");
  });

  it("rejects invalid dates and preserves only bounded resumable state", () => {
    expect(validScanDate("2026-02-30")).toBe(false);
    expect(validScanDate("2026-08-15")).toBe(true);
    expect(cleanGmailScanConfig({ fromDate: "bad", endAt: "x" })).toBeNull();
    expect(cleanGmailScanConfig({ fromDate: "2026-08-15", endAt: "2026-10-03T23:48:00Z", status: "paused", savedAt: "", queryKey: "q", completedSlots: [0, 0, 7], mailboxes: [] })?.completedSlots).toEqual([0]);
  });
});