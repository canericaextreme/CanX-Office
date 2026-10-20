// @vitest-environment happy-dom
import { it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
}));
vi.mock("@/lib/use-brain-view", () => ({
  useBrainView: () => ({
    status: "signed-out",
    message: "",
    view: { source: "live", nodes: [], sparks: [], items: [], events: [], invalidEvents: 0 },
    readAt: null,
    capped: false,
    mode: "off",
    arrivals: [],
    tasks: null,
    approvals: null,
    reload: () => undefined,
  }),
}));
vi.mock("@/lib/brain-index.functions", () => ({ getBrainIndex: {}, setBrainShelf: {} }));
vi.mock("@/lib/owner-session", () => ({
  useOwnerSession: () => ({ accessToken: "fixture", stepUpComplete: true }),
}));
vi.mock("./OfficeFiles", () => ({
  OfficeFiles: ({ onSaved }: { onSaved?: () => void }) =>
    React.createElement("button", { onClick: onSaved }, "Upload from computer"),
}));
import { BrainHub } from "./BrainHub";
import type { BrainIndex, BrainItem } from "@/lib/brain-index";

const base = {
  kind: "file",
  room: "legal",
  folder: "CanX Projects",
  provenance: "Saved file (office_files)",
  version: null,
  access: "metadata only",
  defaultCategory: "downloads",
  category: "downloads",
  manual: false,
  route: "/legal",
} as const;
const item = (
  key: string,
  title: string,
  at: string | null,
  extra: Partial<BrainItem> = {},
): BrainItem => ({ ...base, key, title, at, ...extra });
const index = (items: BrainItem[]): BrainIndex => ({
  checkedAt: "2026-10-03T22:00:00Z",
  items,
  sources: [],
  orphanLabels: 0,
});

it("home shows category shelves and only last-3-day activity, not a full item list", () => {
  const html = renderToString(
    React.createElement(BrainHub, {
      fixture: index([
        item("file:new", "New lease.pdf", "2026-10-03T12:00:00Z"),
        item("file:old", "Old archive.pdf", "2026-08-01T00:00:00Z"),
        item("note:m", "Budget decision", "2026-10-02T00:00:00Z", {
          kind: "note",
          category: "memory",
          defaultCategory: "memory",
        }),
      ]),
    }),
  );
  for (const label of [
    "Compass",
    "Rulebook",
    "Workshop",
    "Piggy Bank",
    "Library",
    "Diary",
    "Logbook",
    "Lost-and-Found",
  ])
    expect(html).toContain(label);
  expect(html).toContain("Recent activity");
  expect(html).toContain("New lease.pdf");
  expect(html).toContain("Budget decision");
  const hub = document.createElement("div");
  hub.innerHTML = html;
  const synopsis = hub.querySelector("#shelf-synopsis-library")!;
  expect(synopsis.textContent).toContain("On this shelf you will find saved files");
  expect(synopsis.textContent).not.toContain("Old archive.pdf");
  synopsis.remove();
  expect(hub.textContent).not.toContain("Old archive.pdf");
  expect(hub.querySelector('[aria-label="Library items"]')).toBeNull();
  expect(hub.querySelector('select[aria-label="Category for Old archive.pdf"]')).toBeNull();
  const rows = [...hub.querySelectorAll("li")].filter((li) =>
    li.querySelector('select[aria-label^="Category for"]'),
  );
  expect(rows).toHaveLength(2);
  expect(rows[0]?.textContent).toContain("New lease.pdf");
  expect(rows[1]?.textContent).toContain("Budget decision");
});

it("clear empty state when nothing in the last three days; unsorted shelf kept when present", () => {
  const html = renderToString(
    React.createElement(BrainHub, {
      fixture: index([
        item("file:x", "Undated thing", null, {
          category: "unsorted",
          defaultCategory: "unsorted",
        }),
      ]),
    }),
  );
  expect(html).toContain("Nothing saved in the last three days");
  expect(html).toContain("Lost-and-Found");
  const hub = document.createElement("div");
  hub.innerHTML = html;
  const synopsis = hub.querySelector("#shelf-synopsis-library")!;
  expect(synopsis.textContent).toContain("On this shelf you will find saved files");
  expect(synopsis.textContent).not.toContain("Undated thing");
  synopsis.remove();
  expect(hub.textContent).not.toContain("Undated thing");
  expect(hub.querySelector('[aria-label="Library items"]')).toBeNull();
});
