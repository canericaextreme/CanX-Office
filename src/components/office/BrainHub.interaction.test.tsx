// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", { href: "#" }, children) }));
vi.mock("@/lib/brain-index.functions", () => ({ getBrainIndex: {}, setBrainCategory: {} }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture", stepUpComplete: true }) }));
import { BrainHub } from "./BrainHub";
import { BRAIN_CATEGORIES, CATEGORY_LABELS, type BrainIndex, type BrainItem, type BrainBucket } from "@/lib/brain-index";

const mk = (key: string, title: string, category: BrainBucket, at = "2026-08-01T00:00:00Z"): BrainItem => ({
  key, title, category, defaultCategory: category, kind: category === "rules-skills" ? "skill" : category === "projects" ? "project" : "file",
  room: "legal", folder: null, at, provenance: "fixture", version: null, access: "metadata only", manual: false, route: "/legal",
});
// One item per category except Discussions (left empty on purpose).
const items: BrainItem[] = [
  mk("file:d", "Item in Downloads", "downloads"), mk("doc:k", "Item in Knowledge", "knowledge"),
  mk("note:m", "Item in Memory", "memory"), mk("project:p", "Item in Projects", "projects"), mk("skill:s", "Item in Rules & Skills", "rules-skills"),
];
const index: BrainIndex = { checkedAt: "2026-10-03T22:00:00Z", items, sources: [], orphanLabels: 0 };
afterEach(cleanup);

const cardFor = (c: BrainBucket) => screen.getByRole("button", { name: new RegExp(`^Open ${CATEGORY_LABELS[c].replace("&", "\\&")}:`) });

describe("Brain category cards open a category view", () => {
  for (const c of BRAIN_CATEGORIES) {
    for (const how of ["click", "keyboard"] as const) {
      it(`${CATEGORY_LABELS[c]} opens by ${how}, shows its items only, and Back restores the hub`, async () => {
        render(<BrainHub fixture={index} />);
        const card = cardFor(c);
        if (how === "click") fireEvent.click(card);
        else { card.focus(); fireEvent.keyDown(card, { key: "Enter" }); fireEvent.click(card); /* native button: Enter dispatches click */ }
        await act(async () => {});
        const heading = screen.getByRole("heading", { level: 3, name: new RegExp(CATEGORY_LABELS[c].replace("&", "\\&")) });
        expect(document.activeElement).toBe(heading);
        expect(screen.queryByRole("navigation", { name: "Brain categories" })).toBeNull(); // cards no longer above
        const list = screen.getByRole("list", { name: `${CATEGORY_LABELS[c]} items` });
        for (const other of items) {
          if (other.category === c) expect(within(list).getByText(other.title)).toBeTruthy();
          else expect(screen.queryByText(other.title)).toBeNull();
        }
        if (c === "discussions") expect(screen.getByText(/Nothing is filed under Discussions yet/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Back to all categories/ }));
        expect(screen.getByRole("navigation", { name: "Brain categories" })).toBeTruthy();
        expect(screen.getByText(/Recent activity/)).toBeTruthy();
      });
    }
  }

  it("opening a category clears a stale global search; global search still works from the hub", async () => {
    render(<BrainHub fixture={index} />);
    const box = screen.getByLabelText("Search the Brain") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Knowledge" } });
    expect(screen.getByText("Item in Knowledge")).toBeTruthy();
    expect(screen.queryByText("Item in Memory")).toBeNull();
    fireEvent.click(cardFor("memory"));
    await act(async () => {});
    expect((screen.getByLabelText("Search the Brain") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Item in Memory")).toBeTruthy();
  });

  it("owner category control stays available inside a category", async () => {
    render(<BrainHub fixture={index} />);
    fireEvent.click(cardFor("downloads"));
    await act(async () => {});
    const sel = screen.getByLabelText("Category for Item in Downloads") as HTMLSelectElement;
    expect(sel.disabled).toBe(false);
  });
});
