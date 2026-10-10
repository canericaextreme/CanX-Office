import { it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children) }));
vi.mock("@/lib/brain-index.functions", () => ({ getBrainIndex: {}, setBrainShelf: {} }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture", stepUpComplete: true }) }));
vi.mock("./OfficeFiles", () => ({ OfficeFiles: ({ onSaved }: { onSaved?: () => void }) => React.createElement("button", { onClick: onSaved }, "Upload from computer") }));
import { BrainHub } from "./BrainHub";
import type { BrainIndex, BrainItem } from "@/lib/brain-index";

const base = { kind: "file", room: "legal", folder: "CanX Projects", provenance: "Saved file (office_files)", version: null, access: "metadata only", defaultCategory: "downloads", category: "downloads", manual: false, route: "/legal" } as const;
const item = (key: string, title: string, at: string | null, extra: Partial<BrainItem> = {}): BrainItem => ({ ...base, key, title, at, ...extra });
const index = (items: BrainItem[]): BrainIndex => ({ checkedAt: "2026-10-03T22:00:00Z", items, sources: [], orphanLabels: 0 });

it("home shows category shelves and only last-3-day activity, not a full item list", () => {
  const html = renderToString(React.createElement(BrainHub, { fixture: index([
    item("file:new", "New lease.pdf", "2026-10-03T12:00:00Z"),
    item("file:old", "Old archive.pdf", "2026-08-01T00:00:00Z"),
    item("note:m", "Budget decision", "2026-10-02T00:00:00Z", { kind: "note", category: "memory", defaultCategory: "memory" }),
  ]) }));
  for (const label of ["Compass", "Rulebook", "Workshop", "Piggy Bank", "Library", "Diary", "Logbook", "Lost-and-Found"]) expect(html).toContain(label);
  expect(html).toContain("Recent activity");
  expect(html).toContain("New lease.pdf");
  expect(html).toContain("Budget decision");
  expect(html).not.toContain("Old archive.pdf"); // older items live in their category / search
  expect(html.indexOf("New lease.pdf")).toBeLessThan(html.indexOf("Budget decision")); // newest first
});

it("clear empty state when nothing in the last three days; unsorted shelf kept when present", () => {
  const html = renderToString(React.createElement(BrainHub, { fixture: index([
    item("file:x", "Undated thing", null, { category: "unsorted", defaultCategory: "unsorted" }),
  ]) }));
  expect(html).toContain("Nothing saved in the last three days");
  expect(html).toContain("Lost-and-Found");
  expect(html).not.toContain("Undated thing");
});
