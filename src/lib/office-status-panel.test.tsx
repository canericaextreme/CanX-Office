import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfficeStatusView } from "../components/office/OfficeStatusPanel";
import type { OfficeStatus } from "./office-status";
const status: OfficeStatus = {
  version: 1, checkedAt: "2026-10-05T16:10:00Z", complete: false,
  projects: [{ id: "project", name: "Safe Highways", stage: "unknown", stageBasis: "Not verified", updatedAt: null }],
  sharedLog: [{ id: "decision", at: "2026-10-05T16:05:10Z", actor: "John", kind: "decision", audience: "office-status", summary: "Stage 1 only", evidence: "Owner request" }], recentDecisions: [],
  openTasks: [{ id: "task-1", projectId: "project", status: "waiting", updatedAt: null }],
  knownProblems: ["A source could not be read"], tools: [{ name: "Anthropic", state: "configured-unverified", detail: "Not a live check" }],
  sources: [{ name: "Register", state: "read", count: 1, truncated: false }], privacy: "Archive content excluded",
};
describe("populated Stage 1 status view", () => {
  it("renders real entries with their uncertain states and portable JSON", () => {
    const html = renderToStaticMarkup(<OfficeStatusView status={status} />);
    for (const text of ["Safe Highways", "unknown", "Stage 1 only", "task-1", "waiting", "configured-unverified", "incomplete or unavailable", "View portable status JSON"]) expect(html).toContain(text);
  });
  it("does not present a failed register read as no projects", () => {
    const html = renderToStaticMarkup(<OfficeStatusView status={{ ...status, projects: [], sources: [{ name: "Register", state: "denied", count: 0, truncated: false }] }} />);
    expect(html).toContain("The project register could not be read.");
    expect(html).not.toContain("No projects were found");
  });
});
