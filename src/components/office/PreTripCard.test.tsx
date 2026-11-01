// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PRETRIP_SCHEMA, type PreTripRecord } from "@/lib/pretrip";

vi.mock("@/lib/pretrip.functions", () => ({ readPreTrip: "read", runPreTrip: "run" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ signedIn: false, viewer: false, accessToken: null, stepUpComplete: false }) }));

const { PreTripCardView } = await import("./PreTripCard");
afterEach(cleanup);

const record: PreTripRecord = {
  schema: PRETRIP_SCHEMA, id: "pretrip-20261024-daily", date: "2026-10-24", trigger: "daily",
  startedAt: "2026-10-24T15:00:00Z", finishedAt: "2026-10-24T15:00:04Z", inspection: "complete", overall: "yellow",
  checks: [
    { id: "colleague:chatgpt", area: "AI team", label: "ChatGPT (Office helper) message test", status: "green", detail: "Two-way OK in 0.9 s" },
    { id: "colleague:claude", area: "AI team", label: "Claude (Office helper) message test", status: "yellow", detail: "Not passed: timed out" },
    { id: "room:/finance", area: "Rooms", label: "Finance", status: "unverified", detail: "Could not check: receipts (needs two-step sign-in)", since: "2026-10-23" },
  ],
  rooms: { total: 24, verified: 23 }, email: { sweep: "ok", needsAttention: 3, archive: 12, ignored: 1 },
  outstanding: 30, approvals: 2, yesterday: "Worked on ChatGPT pictures.",
  changes: { newProblems: ["Claude (Office helper) message test"], carried: ["Finance (2 days, look into it in Office Health)"], resolved: [] }, previousId: null,
};

describe("Daily Pre-Trip Card", () => {
  it("shows today's results with real values and expandable findings", () => {
    render(<PreTripCardView record={record} now={new Date("2026-10-24T18:00:00Z")} running={false} message={null} canRun onRun={() => undefined} />);
    expect(screen.getByText("Overall Yellow")).toBeTruthy();
    expect(screen.getByText("23 of 24 green")).toBeTruthy();
    expect(screen.getByText("12 to archive · delete: not counted")).toBeTruthy();
    fireEvent.click(screen.getByText("Show all findings"));
    expect(screen.getByText(/needs two-step sign-in/)).toBeTruthy();
    expect(screen.getByText(/Carried forward: Finance/)).toBeTruthy();
  });

  it("flips to NOT CHECKED TODAY on a new day and keeps open problems visible", () => {
    render(<PreTripCardView record={record} now={new Date("2026-10-25T08:00:00Z")} running={false} message={null} canRun={false} />);
    expect(screen.getByText("NOT CHECKED TODAY")).toBeTruthy();
    expect(screen.getByText(/Still open from 2026-10-24/)).toBeTruthy();
    expect(screen.getByText("Claude (Office helper) message test")).toBeTruthy();
  });
});

describe("Reception pre-trip light", () => {
  it("renders nothing at all for a viewer or signed-out session, so no empty box shows", async () => {
    const { PreTripBadge } = await import("./PreTripCard");
    const { container } = render(<PreTripBadge className="box" />);
    expect(container.innerHTML).toBe("");
  });
});
