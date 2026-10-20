// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/use-brain-view", () => ({ useBrainView: () => ({ status: "signed-out" }) }));
import { BrainCast } from "./BrainCast";
import type { BrainViewState } from "@/lib/use-brain-view";

const base = {
  message: "",
  view: { source: "live", nodes: [], sparks: [], items: [], events: [], invalidEvents: 0 },
  readAt: null,
  capped: false,
  mode: "off",
  arrivals: [],
  approvals: [],
  reload: () => undefined,
} as unknown as BrainViewState;

afterEach(cleanup);

describe("Who's who cards", () => {
  it("show today's roles and a live Now line from the Work Board", () => {
    render(
      <BrainCast
        state={{
          ...base,
          status: "ready",
          tasks: [
            {
              id: "1",
              title: "t",
              saved: { title: "t", detail: "", project: "" },
              status: "waiting",
              worker: "claude",
              waitingReason: "",
              risk: "green",
              updatedAt: "",
            },
          ],
        }}
      />,
    );
    const claude = document.querySelector('[data-cast="Claude"]')!;
    expect(claude.textContent).toContain("Builder and reviewer");
    expect(claude.textContent).toContain("Now: 1 on hold on the Work Board.");
    expect(document.querySelector('[data-cast="Elsie"]')!.textContent).toContain(
      "Now: Nothing assigned on the Work Board.",
    );
    expect(document.body.textContent).not.toMatch(/Front-Desk|Second Pair of Eyes|the Drafter/);
  });

  it("says when the live part couldn't be read", () => {
    render(<BrainCast state={{ ...base, status: "unavailable", tasks: null }} />);
    expect(document.querySelector('[data-cast="Elsie"]')!.textContent).toContain(
      "Now: couldn't be read just now.",
    );
  });
});
