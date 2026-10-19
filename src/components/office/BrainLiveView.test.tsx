// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildBrainView } from "@/lib/brain-view";
import { BRAIN_VIEW_ROUTES } from "@/lib/brain-view-layout";
import { MANAGER_HANDOFF_EVENT, type ManagerHandoff } from "@/lib/companion-bridge";
import type { BrainViewState } from "@/lib/use-brain-view";

vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    c["inputValidator"] = () => c;
    c["handler"] = () => vi.fn();
    return c;
  };
  return { useServerFn: () => vi.fn(), createServerFn: () => chain() };
});
vi.mock("@/lib/owner-session", () => ({
  useOwnerSession: () => ({ accessToken: null, viewer: false }),
}));
import { BrainLiveView } from "./BrainLiveView";
import { BrainActivityCharts } from "./BrainActivityCharts";
import { readFileSync } from "node:fs";

const NOW = new Date();
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const rows = [
  {
    id: "1",
    subject_kind: "task",
    subject_id: "a",
    from_room: null,
    to_room: "/idea-garage",
    from_stage: null,
    to_stage: "brainstorming",
    source: "work-board",
    occurred_at: ago(3),
  },
  {
    id: "2",
    subject_kind: "task",
    subject_id: "a",
    from_room: "/idea-garage",
    to_room: "/projects",
    from_stage: "brainstorming",
    to_stage: "building",
    source: "work-board",
    occurred_at: ago(1),
  },
  {
    id: "3",
    subject_kind: "office-build",
    subject_id: "b",
    from_room: null,
    to_room: "/build-testing",
    from_stage: null,
    to_stage: "stalled",
    source: "work-board",
    occurred_at: ago(2),
  },
  {
    id: "4",
    subject_kind: "task",
    subject_id: "c",
    from_room: null,
    to_room: "/work-board",
    from_stage: null,
    to_stage: "completed",
    source: "task-cancelled",
    occurred_at: ago(2),
  },
];
const ready = (over: Partial<BrainViewState> = {}): BrainViewState => ({
  status: "ready",
  message: "",
  view: buildBrainView(rows, BRAIN_VIEW_ROUTES, NOW, "live"),
  readAt: NOW.toISOString(),
  capped: false,
  mode: "live",
  arrivals: [],
  tasks: [],
  approvals: [],
  reload: () => undefined,
  ...over,
});

afterEach(cleanup);

describe("Live Brain view", () => {
  it("sits in the Brain room next to the shelf map", () => {
    const page = readFileSync("src/routes/_office/brain.tsx", "utf8");
    expect(page).toMatch(/<BrainLiveView \/>\s*<BrainMap \/>/);
  });

  it("shows the stage legend with names, not colour alone", () => {
    render(<BrainLiveView state={ready()} />);
    const legend = screen.getByRole("list", { name: "Stage colours" });
    for (const name of [
      "Brainstorming",
      "Strategizing",
      "Building",
      "Completed",
      "Stalled",
      "No recorded work",
    ])
      expect(within(legend).getByText(name)).toBeTruthy();
  });

  it("lists rooms with active work and the last move, from the logbook only", () => {
    render(<BrainLiveView state={ready()} />);
    const busy = screen.getByRole("list", { name: "Rooms with active work" });
    expect(within(busy).getByText("Projects")).toBeTruthy();
    expect(within(busy).getByText("Build")).toBeTruthy();
    expect(within(busy).queryByText("Work Board")).toBeNull(); // cancelled work is not active
    expect(screen.getByText(/last move Idea Garage → Projects/)).toBeTruthy();
    expect(screen.getByText(/1 cancelled/)).toBeTruthy();
    expect(screen.getByText(/Live — moves appear the moment they are recorded/)).toBeTruthy();
  });

  it("says so plainly when the 3D picture can't run, and still shows the information", async () => {
    render(<BrainLiveView state={ready()} />);
    await waitFor(() => expect(screen.getByText(/needs WebGL/)).toBeTruthy());
    expect(screen.getByRole("img", { name: /Projects: 1 active/ })).toBeTruthy();
  });

  it("shows no activity when the logbook can't be read", () => {
    render(
      <BrainLiveView
        state={ready({
          status: "unavailable",
          message: "The work logbook could not be read just now.",
          view: buildBrainView([], BRAIN_VIEW_ROUTES, NOW, "unavailable"),
        })}
      />,
    );
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByText("The work logbook could not be read just now.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Rooms with active work" })).toBeNull();
  });

  it("hands Elsie an unsent question about the view", () => {
    const got: ManagerHandoff[] = [];
    const on = (e: Event) => got.push((e as CustomEvent<ManagerHandoff>).detail);
    window.addEventListener(MANAGER_HANDOFF_EVENT, on);
    render(<BrainLiveView state={ready()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask Elsie to explain" }));
    window.removeEventListener(MANAGER_HANDOFF_EVENT, on);
    expect(got[0]).toMatchObject({ room: "brain", path: "/brain", source: "room_button" });
    expect(got[0]!.text).toMatch(/live Brain view/);
  });
});

describe("Analytics work charts", () => {
  it("draws stage totals, daily changes and stalled rooms with a table view", () => {
    render(<BrainActivityCharts state={ready()} />);
    expect(screen.getByText("Work by stage now")).toBeTruthy();
    expect(screen.getByText("Changes per day — last 14 days")).toBeTruthy();
    expect(screen.getByText("Where work is stalled")).toBeTruthy();
    expect(screen.getByText(/1 cancelled \(not counted as completed\)/)).toBeTruthy();
    expect(screen.getByText("Show these numbers as a table")).toBeTruthy();
  });
  it("keeps the owner-only logbook out of the read-only viewer", () => {
    render(<BrainActivityCharts state={ready()} viewer />);
    expect(screen.getByText(/owner-only/)).toBeTruthy();
    expect(screen.queryByText("Work by stage now")).toBeNull();
  });
});
