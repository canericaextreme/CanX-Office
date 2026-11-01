// @vitest-environment happy-dom
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildAnalyticsOverview } from "@/lib/analytics-overview";
import { MANAGER_HANDOFF_EVENT, type ManagerHandoff } from "@/lib/companion-bridge";
import { fixtureRaw } from "@/lib/analytics-overview.fixture";

const session = { accessToken: "fixture" as string | null, viewer: false };
const snapshotFn = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({ ...(await importOriginal<object>()), createFileRoute: () => (options: unknown) => options }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => snapshotFn }));
vi.mock("@/lib/safe-highways-progress.functions", () => ({ getSafeHighwaysProgress: vi.fn() }));
vi.mock("@/lib/room-snapshot.functions", () => ({ getRoomSnapshot: vi.fn() }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => session }));
vi.mock("@/components/office/OfficeFiles", () => ({ OfficeFiles: ({ room }: { room: string }) => <section>Files for {room}</section> }));
vi.mock("@/components/office/BrainActivityCharts", () => ({ BrainActivityCharts: ({ viewer }: { viewer?: boolean }) => <section>Work through the Office{viewer ? " (viewer)" : ""}</section> }));
vi.mock("@/components/office/RoomSkillsLink", () => ({ RoomSkillsLink: ({ route }: { route: string }) => <a href="/skills">Skills for {route}</a> }));
import { AnalyticsBoard, Route } from "./analytics";

const source = readFileSync("src/routes/_office/analytics.tsx", "utf8");
const overview = buildAnalyticsOverview(fixtureRaw());
const ready = { kind: "ready" as const, overview };
const board = (over: Partial<React.ComponentProps<typeof AnalyticsBoard>> = {}) =>
  render(<AnalyticsBoard load={ready} onRefresh={() => undefined} busy={false} canAsk deviceCheck="not verified on this build yet" {...over} />);

beforeEach(() => { session.accessToken = "fixture"; session.viewer = false; snapshotFn.mockReset(); });
afterEach(cleanup);

describe("Analytics room keeps existing access", () => {
  it("keeps the room's Files panel and Skills link", () => {
    expect(source).toContain('<OfficeFiles room="analytics" />');
    expect(source).toContain('<RoomSkillsLink route="/analytics" />');
  });
  it("shows the work charts from the live Brain view's logbook", () => {
    expect(source).toContain("<BrainActivityCharts viewer={!!session.viewer} />");
  });
});

describe("Analytics overview cards", () => {
  it("shows all ten cards with real readings and honesty labels", () => {
    board();
    const cards = within(screen.getByRole("region", { name: "Analytics overview" })).getAllByRole("button");
    expect(cards).toHaveLength(10);
    expect(screen.getByText("2,500 of 10,000 estimated cents (25%)")).toBeTruthy();
    expect(screen.getByText("Claude 2/4 passed · Codex 2/3 passed")).toBeTruthy();
    expect(screen.getAllByText("Estimate").length).toBeGreaterThan(0);
  });

  it("opens a card's drilldown by click, shows sources and closes with Escape", () => {
    board();
    fireEvent.click(screen.getByRole("button", { name: /Money and Budgets/ }));
    const dialog = screen.getByRole("dialog", { name: "Money and Budgets details" });
    expect(within(dialog).getByText("Office monthly running-cost ceiling")).toBeTruthy();
    expect(within(dialog).getAllByText("Policy limit").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Source: Finance receipts/).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("img")).toBeTruthy(); // CAD receipts chart
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with the Back button and by keyboard Enter on a card", () => {
    board();
    const card = screen.getByRole("button", { name: /Builder Performance/ });
    card.focus();
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: /Back to overview/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts an unsent explain-like-I'm-10 draft in Elsie's panel and never sends it", () => {
    const seen: ManagerHandoff[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<ManagerHandoff>).detail);
    window.addEventListener(MANAGER_HANDOFF_EVENT, on);
    board();
    fireEvent.click(screen.getByRole("button", { name: /explain this room like I'm 10/ }));
    fireEvent.click(screen.getByRole("button", { name: /API Usage and Credits/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ask Elsie: explain like I'm 10/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back to overview/ }));
    fireEvent.click(screen.getByRole("button", { name: /explain my API costs/ }));
    window.removeEventListener(MANAGER_HANDOFF_EVENT, on);
    expect(seen.map((s) => s.text)).toEqual([
      "Elsie, explain this whole Analytics room like I'm 10 years old.",
      expect.stringContaining('explain the "API Usage and Credits" card in the Analytics room like I\'m 10 years old'),
      "Elsie, explain my API costs.",
    ]);
    expect(seen.every((s) => s.path === "/analytics" && s.source === "room_button")).toBe(true);
  });

  it("offers no Elsie buttons in a read-only viewer session", () => {
    board({ canAsk: false });
    expect(screen.queryByRole("button", { name: /explain this room/ })).toBeNull();
    expect(screen.getByText("Elsie is not available in this read-only view.")).toBeTruthy();
  });

  it("never shows numbers before data loads", () => {
    board({ load: { kind: "signed-out" } });
    expect(screen.getAllByText("Not loaded").length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText(/Sign in to load measurements/)).toBeTruthy();
  });
});

describe("Analytics room loading", () => {
  const Room = (Route as unknown as { component: () => React.ReactElement }).component;

  it("loads the measurements from the shared room snapshot", async () => {
    snapshotFn.mockResolvedValue({ ok: true, snapshot: { sources: [{ key: "analytics", analytics: overview }] } });
    await act(async () => { render(<Room />); });
    await waitFor(() => expect(screen.getByText("2,500 of 10,000 estimated cents (25%)")).toBeTruthy());
    expect(snapshotFn).toHaveBeenCalledWith({ data: expect.objectContaining({ accessToken: "fixture", route: "/analytics" }) });
  });

  it("shows the refusal instead of numbers when the read is refused", async () => {
    snapshotFn.mockResolvedValue({ ok: false, code: "auth", message: "Sign in again." });
    await act(async () => { render(<Room />); });
    await waitFor(() => expect(screen.getByText("Not loaded: Sign in again.")).toBeTruthy());
    expect(screen.queryByText(/estimated cents/)).toBeNull();
  });

  it("reads nothing while signed out", async () => {
    session.accessToken = null;
    await act(async () => { render(<Room />); });
    expect(snapshotFn).not.toHaveBeenCalled();
  });
});
