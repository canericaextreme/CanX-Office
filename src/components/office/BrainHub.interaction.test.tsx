// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", { href: "#" }, children) }));
vi.mock("@/lib/brain-index.functions", () => ({ getBrainIndex: {}, setBrainShelf: {} }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ accessToken: "fixture", stepUpComplete: true }) }));
vi.mock("./OfficeFiles", () => ({ OfficeFiles: ({ onSaved }: { onSaved?: () => void }) => React.createElement("button", { onClick: onSaved }, "Upload from computer") }));
import { BrainHub } from "./BrainHub";
import { type BrainIndex, type BrainItem } from "@/lib/brain-index";
import { BRAIN_SHELVES as BRAIN_CATEGORIES, SHELF_LABELS as CATEGORY_LABELS, type BrainShelf as BrainBucket } from "@/lib/brain-shelves";

const mk = (key: string, title: string, shelf: BrainBucket, at = "2026-08-01T00:00:00Z"): BrainItem => ({
  key, title, shelf, shelfReadable: true, shelfExpected: null, category: "downloads", defaultCategory: "downloads", kind: "file",
  room: "legal", folder: null, at, provenance: "fixture", version: null, access: "metadata only", manual: false, route: "/legal",
});
const items: BrainItem[] = BRAIN_CATEGORIES.filter(s => s !== "diary").map(s => mk(`file:${s}`, `Item in ${CATEGORY_LABELS[s]}`, s));
const index: BrainIndex = { checkedAt: "2026-10-03T22:00:00Z", items, sources: [], orphanLabels: 0 };
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/brain"); });

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
          if (other.shelf === c) expect(within(list).getByText(other.title)).toBeTruthy();
          else expect(screen.queryByText(other.title)).toBeNull();
        }
        if (c === "diary") expect(screen.getByText(/Nothing is filed under Diary yet/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Back to all categories/ }));
        expect(screen.getByRole("navigation", { name: "Brain categories" })).toBeTruthy();
        expect(screen.getByText(/Recent activity/)).toBeTruthy();
      });
    }
  }

  it("opening a category clears a stale global search; global search still works from the hub", async () => {
    render(<BrainHub fixture={index} />);
    const box = screen.getByLabelText("Search the Brain") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Library" } });
    expect(screen.getByText("Item in Library")).toBeTruthy();
    expect(screen.queryByText("Item in Compass")).toBeNull();
    fireEvent.click(cardFor("compass"));
    await act(async () => {});
    expect((screen.getByLabelText("Search the Brain") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Item in Compass")).toBeTruthy();
  });

  it("owner category control stays available inside a category", async () => {
    render(<BrainHub fixture={index} />);
    fireEvent.click(cardFor("library"));
    await act(async () => {});
    const sel = screen.getByLabelText("Category for Item in Library") as HTMLSelectElement;
    expect(sel.disabled).toBe(false);
  });
});


it("opens a direct shelf route, filters its own items, and supports browser navigation", async () => {
  window.history.replaceState(null, "", "/brain#shelf-library");
  render(<BrainHub fixture={{ ...index, items: [...items, { ...mk("file:two", "Other library", "library"), room: "research", folder: "Earlier" }] }} />);
  await act(async () => {});
  expect(screen.getByRole("heading", { level: 3, name: /Library/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Upload from computer" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Room"), { target: { value: "research" } });
  const list = screen.getByRole("list", { name: "Library items" });
  expect(within(list).queryByText("Item in Library")).toBeNull();
  expect(within(list).getByText("Other library")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search the Brain"), { target: { value: "absent" } });
  expect(screen.getByText("0 matching items")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to all categories" }));
  expect(window.location.hash).toBe("");
  expect(screen.getByRole("navigation", { name: "Brain categories" })).toBeTruthy();
  await act(async () => { window.history.replaceState(null, "", "/brain#shelf-compass"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(screen.getByRole("heading", { level: 3, name: /Compass/ })).toBeTruthy();
});

it("provides two provider navigation cards without submitting a build", () => {
  render(<BrainHub fixture={index} />);
  expect(screen.getByRole("link", { name: "Open ChatGPT / Codex builder" }).getAttribute("href")).toBe("/build-testing#codex-builder");
  expect(screen.getByRole("link", { name: "Open Claude builder" }).getAttribute("href")).toBe("/build-testing#claude-builder");
});

it("shelf cards show number badge, colour name, guide wording, Who's who strip and a live hover summary", () => {
  render(<BrainHub fixture={{ checkedAt: "2026-10-03T22:00:00Z", items, sources: [], orphanLabels: 0 }} />);
  const card = document.querySelector('[data-shelf="3"]') as HTMLElement;
  expect(card.textContent).toContain("The Workshop");
  expect(card.textContent).toContain("Green shelf");
  expect(card.textContent).toContain("Projects and apps.");
  expect(screen.getByRole("heading", { name: "Who's who" })).toBeTruthy();
  expect(document.querySelectorAll("[data-cast]").length).toBe(5);
  // synopsis exists for keyboard and screen-reader users, is built from the shelf's records, and the touch button toggles it
  const tip = document.getElementById("shelf-synopsis-workshop") as HTMLElement;
  expect(tip.textContent).toMatch(/The Workshop: Projects and apps\. 1 item \(1 file\)/);
  const info = screen.getByRole("button", { name: "About The Workshop" });
  expect(info.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(info);
  expect(info.getAttribute("aria-expanded")).toBe("true");
});
