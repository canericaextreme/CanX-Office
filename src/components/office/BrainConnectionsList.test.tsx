// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BRAIN_EDGES } from "@/lib/brain-data";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { BrainConnectionsList } from "./BrainConnectionsList";

describe("Brain room shows one map, not two", () => {
  it("the Brain room no longer draws the second BrainMap; the live view stays", () => {
    const page = readFileSync("src/routes/_office/brain.tsx", "utf8");
    expect(page).toContain("<BrainLiveView />");
    expect(page).not.toContain("<BrainMap />");
    expect(page).toContain("<BrainConnectionsList />");
  });

  it("lists the documented connections as text", () => {
    render(<BrainConnectionsList />);
    const list = screen.getByRole("list", { name: "Documented Office connections" });
    expect(list.querySelectorAll("li").length).toBeGreaterThan(0);
    expect(list.querySelectorAll("li").length).toBeLessThanOrEqual(BRAIN_EDGES.length);
  });
});
