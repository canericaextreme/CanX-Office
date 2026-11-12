// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FIRST_HOVER_MS, HOLD_MS, HoverGuide } from "./HoverGuide";
import { BOX_DESCRIPTIONS } from "@/lib/box-descriptions";
import { ROOM_TIPS } from "@/lib/hover-guide";

function Office({ editing = false }: { editing?: boolean }) {
  return (
    <>
      <div data-canx-hover-root="true">
        <nav>
          <a href="/finance">Finance</a>
        </nav>
        <h1>Owner's Desk</h1>
        <div
          data-room-box="owner-desk.priorities"
          data-room-box-name="Today's priorities"
          data-room-box-home="/owner-desk"
          className={editing ? "canx-room-box canx-room-box-editing" : "canx-room-box"}
        >
          <h2>Today's priorities</h2>
          <p>Task list</p>
          <button type="button">Approve</button>
          <button type="button">Frobnicate</button>
        </div>
        <div
          data-room-box="owner-desk.budget"
          data-room-box-name="AI operating budget this month"
          data-room-box-home="/owner-desk"
          data-room-box-renamed="Money left"
        >
          <p>Budget words</p>
        </div>
        <input aria-label="Type here" />
      </div>
      <button type="button">Outside the Office</button>
      <HoverGuide />
    </>
  );
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const hover = (el: Element) => fireEvent.pointerOver(el, { pointerType: "mouse" });
const tip = () => screen.queryByRole("tooltip");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.pushState({}, "", "/owner-desk");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("resting on a box shows what it is and what it's for", async () => {
  render(<Office />);
  hover(screen.getByText("Task list"));
  expect(tip()).toBeNull();
  await wait(FIRST_HOVER_MS + 10);
  expect(tip()!.textContent).toContain("Today's priorities");
  expect(tip()!.textContent).toContain(BOX_DESCRIPTIONS["owner-desk.priorities"]!.what);
  expect(tip()!.textContent).toContain("What it's for");
  expect(tip()!.getAttribute("data-canx-no-capture")).toBe("true");
});

it("moving from item to item swaps the explanation straight away", async () => {
  render(<Office />);
  hover(screen.getByText("Task list"));
  await wait(FIRST_HOVER_MS + 10);
  hover(screen.getByText("Approve"));
  expect(tip()!.textContent).toContain("Says yes");
  expect(tip()!.textContent).toContain('In the "Today\'s priorities" box');
  hover(screen.getByText("Budget words"));
  expect(tip()!.textContent).toContain("Money left");
  expect(tip()!.textContent).toContain("Built as");
  hover(screen.getByText("Finance"));
  expect(tip()!.textContent).toContain(ROOM_TIPS["/finance"]!.what);
  hover(screen.getByRole("heading", { level: 1 }));
  expect(tip()!.textContent).toContain(ROOM_TIPS["/owner-desk"]!.what);
});

it("a button with no written line is explained by its name and its box, nothing invented", async () => {
  render(<Office />);
  hover(screen.getByText("Frobnicate"));
  await wait(FIRST_HOVER_MS + 10);
  expect(tip()!.textContent).toContain('"Frobnicate"');
  expect(tip()!.textContent).toContain(BOX_DESCRIPTIONS["owner-desk.priorities"]!.why);
});

it("nothing shows outside the Office, in a typing box, or on a box being edited", async () => {
  const { unmount } = render(<Office />);
  hover(screen.getByText("Outside the Office"));
  hover(screen.getByLabelText("Type here"));
  await wait(FIRST_HOVER_MS + 10);
  expect(tip()).toBeNull();
  unmount();
  render(<Office editing />);
  hover(screen.getByText("Task list"));
  await wait(FIRST_HOVER_MS + 10);
  expect(tip()).toBeNull();
});

it("phone: press and hold shows the explanation and does not also press the button", async () => {
  const pressed = vi.fn();
  render(<Office />);
  const approve = screen.getByText("Approve");
  approve.addEventListener("click", pressed);
  fireEvent.pointerDown(approve, { pointerType: "touch", clientX: 5, clientY: 5 });
  await wait(HOLD_MS + 10);
  fireEvent.pointerUp(approve, { pointerType: "touch" });
  fireEvent.click(approve);
  expect(tip()!.textContent).toContain("Says yes");
  expect(pressed).not.toHaveBeenCalled();
  // A normal tap afterwards works and closes the explanation.
  fireEvent.pointerDown(approve, { pointerType: "touch", clientX: 5, clientY: 5 });
  fireEvent.pointerUp(approve, { pointerType: "touch" });
  fireEvent.click(approve);
  expect(pressed).toHaveBeenCalledTimes(1);
  expect(tip()).toBeNull();
});

it("phone: a finger that scrolls does not open an explanation", async () => {
  render(<Office />);
  const el = screen.getByText("Task list");
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 5, clientY: 5 });
  fireEvent.pointerMove(el, { pointerType: "touch", clientX: 5, clientY: 80 });
  await wait(HOLD_MS + 10);
  expect(tip()).toBeNull();
});

it("Escape closes the explanation", async () => {
  render(<Office />);
  hover(screen.getByText("Task list"));
  await wait(FIRST_HOVER_MS + 10);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(tip()).toBeNull();
});
