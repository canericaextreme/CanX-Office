// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { BrainSection } from "./BrainSection";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  localStorage.clear();
});

const box = (id = "brain-memory") =>
  render(
    <BrainSection id={id} label="Saved conversation memory" hint="Summaries Elsie reads.">
      <p>Inside</p>
    </BrainSection>,
  );

describe("Brain room boxes", () => {
  it("start closed with a clear label and a one-line hint", () => {
    box();
    const details = document.getElementById("brain-memory") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByText("Saved conversation memory")).toBeTruthy();
    expect(screen.getByText("Summaries Elsie reads.")).toBeTruthy();
  });

  it("open when a link jumps to them", () => {
    window.location.hash = "#brain-memory";
    box();
    expect((document.getElementById("brain-memory") as HTMLDetailsElement).open).toBe(true);
  });

  it("remember a box John opened, on this device", () => {
    box();
    const d = document.getElementById("brain-memory") as HTMLDetailsElement;
    d.open = true;
    fireEvent(d, new Event("toggle"));
    cleanup();
    box();
    expect((document.getElementById("brain-memory") as HTMLDetailsElement).open).toBe(true);
  });

  it("wrap every supporting section below the live view, keeping their link ids", () => {
    const page = readFileSync("src/routes/_office/brain.tsx", "utf8").replace(/\s+/g, " ");
    for (const id of ["brain-documents", "brain-memory", "brain-map", "brain-growth"])
      expect(page).toContain(`<BrainSection id="${id}"`);
    expect(page.indexOf("<BrainLiveView />")).toBeLessThan(page.indexOf("<BrainSection"));
  });
});
