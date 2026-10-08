// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { OfficeDogs } from "./OfficeDogs";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders each requested breed once, preserves the pit bull, and resolves every local asset", () => {
  render(<OfficeDogs />);
  expect(screen.getAllByRole("button")).toHaveLength(4);
  for (const breed of ["pit bull", "husky", "golden retriever", "gray pug"]) {
    const dog = screen.getByRole("button", { name: `Move the office ${breed}` });
    const img = dog.querySelector("img")!;
    expect(img.getAttribute("draggable")).toBe("false");
    expect(existsSync(`public${img.getAttribute("src")}`)).toBe(true);
  }
});

it("retains the original saved placement and persists independent breed positions after remount", () => {
  window.localStorage.setItem("canx-office-dog-position-v1", '{"x":32,"y":45}');
  const { unmount } = render(<OfficeDogs />);
  const pitBull = screen.getByRole("button", { name: "Move the office pit bull" });
  expect(pitBull.style.left).toBe("32%");
  expect(pitBull.style.top).toBe("45%");
  fireEvent.keyDown(screen.getByRole("button", { name: "Move the office husky" }), {
    key: "ArrowRight",
  });
  expect(JSON.parse(window.localStorage.getItem("canx-office-dog-husky-position-v1")!)).toEqual({
    x: 47,
    y: 57,
  });
  expect(pitBull.style.left).toBe("32%");
  unmount();
  render(<OfficeDogs />);
  expect(screen.getByRole("button", { name: "Move the office husky" }).style.left).toBe("47%");
});

it("moves only the dragged dog, clamps placement and stops when the pointer is cancelled", () => {
  render(<OfficeDogs />);
  const pug = screen.getByRole("button", { name: "Move the office gray pug" });
  pug.setPointerCapture = vi.fn();
  vi.spyOn(pug.parentElement!, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 500,
  } as DOMRect);
  fireEvent.pointerDown(pug, { pointerId: 1, clientX: 700, clientY: 400 });
  expect(pug.style.left).toBe("70%");
  expect(pug.style.top).toBe("80%");
  fireEvent.pointerMove(pug, { pointerId: 1, clientX: 1200, clientY: -100 });
  expect(pug.style.left).toBe("96%");
  expect(pug.style.top).toBe("7%");
  fireEvent.pointerCancel(pug, { pointerId: 1 });
  fireEvent.pointerMove(pug, { pointerId: 1, clientX: 500, clientY: 250 });
  expect(pug.style.left).toBe("96%");
  expect(screen.getByRole("button", { name: "Move the office golden retriever" }).style.left).toBe(
    "61%",
  );
});

it("handles malformed and unavailable device storage without losing the dogs", () => {
  window.localStorage.setItem("canx-office-dog-husky-position-v1", "null");
  window.localStorage.setItem("canx-office-dog-gray-pug-position-v1", "invalid");
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  render(<OfficeDogs />);
  const husky = screen.getByRole("button", { name: "Move the office husky" });
  expect(husky.style.left).toBe("46%");
  fireEvent.keyDown(husky, { key: "ArrowLeft" });
  expect(husky.style.left).toBe("45%");
  expect(screen.getAllByRole("button")).toHaveLength(4);
});
