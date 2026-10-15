// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WalkingPeople } from "./Office3D";
import { OfficeDogs } from "./OfficeDogs";

const key = "canx-office-people-positions-v1";
const original = [
  { x: 50, y: 69 }, { x: 35, y: 61 }, { x: 29, y: 43 },
  { x: 39, y: 25 }, { x: 58, y: 26 }, { x: 71, y: 42 },
  { x: 68, y: 61 }, { x: 43, y: 73 }, { x: 23, y: 53 },
  { x: 63, y: 32 }, { x: 77, y: 54 },
];
const read = () => JSON.parse(window.localStorage.getItem(key)!);
const people = () => screen.getAllByRole("button", { name: /^Move office person / });

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("renders eighteen people with the original eleven defaults and existing sprite style", () => {
  render(<WalkingPeople />);
  expect(people()).toHaveLength(18);
  expect(read().slice(0, 11)).toEqual(original);
  expect(new Set(read().map((p: { x: number; y: number }) => `${p.x},${p.y}`)).size).toBe(18);
  for (const person of people()) {
    expect(person.classList.contains("office-person")).toBe(true);
    expect(person.querySelector(".office-person__sprite")).not.toBeNull();
  }
});

it.each([7, 11, 18])("preserves all %i saved positions and fills only missing defaults across remount", (count) => {
  render(<WalkingPeople />);
  const defaults = read();
  cleanup();
  const saved = Array.from({ length: count }, (_, index) => ({ x: 10.25 + index, y: 80.75 - index }));
  window.localStorage.setItem(key, JSON.stringify(saved));
  const { unmount } = render(<WalkingPeople />);
  expect(people()).toHaveLength(18);
  expect(read()).toEqual([...saved, ...defaults.slice(count)]);
  for (const [index, position] of saved.entries()) {
    expect(people()[index]!.style.left).toBe(`${position.x}%`);
    expect(people()[index]!.style.top).toBe(`${position.y}%`);
  }
  unmount();
  render(<WalkingPeople />);
  expect(read()).toEqual([...saved, ...defaults.slice(count)]);
});

it("persists dragging a new person without moving existing people or any saved dogs", () => {
  const dogKeys = ["canx-office-dog-position-v1", "canx-office-dog-husky-position-v1", "canx-office-dog-golden-retriever-position-v1", "canx-office-dog-gray-pug-position-v1"];
  const savedDogs = dogKeys.map((_, index) => ({ x: 31 + index, y: 45 + index }));
  dogKeys.forEach((key, index) => window.localStorage.setItem(key, JSON.stringify(savedDogs[index])));
  const { unmount } = render(<><WalkingPeople /><OfficeDogs /></>);
  const before = read();
  const person = people()[17]!;
  person.setPointerCapture = vi.fn();
  person.releasePointerCapture = vi.fn();
  vi.spyOn(person.parentElement!, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 500 } as DOMRect);
  fireEvent.pointerDown(person, { pointerId: 1, clientX: 600, clientY: 350 });
  fireEvent.pointerMove(person, { pointerId: 1, clientX: 620, clientY: 360 });
  fireEvent.pointerUp(person, { pointerId: 1 });
  fireEvent.pointerMove(person, { pointerId: 1, clientX: 700, clientY: 400 });
  expect(read()).toEqual([...before.slice(0, 17), { x: 62, y: 72 }]);
  expect(screen.getAllByRole("button", { name: /^Move the office / })).toHaveLength(4);
  dogKeys.forEach((key, index) => expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual(savedDogs[index]));
  unmount();
  render(<WalkingPeople />);
  expect(people()[17]!.style.left).toBe("62%");
  expect(people()[17]!.style.top).toBe("72%");
});
