import { describe, expect, it } from "vitest";
import { clampPanelPosition } from "./use-draggable-panel";

describe("clampPanelPosition", () => {
  it("keeps a fully visible panel unchanged", () => {
    const result = clampPanelPosition(
      { right: 16, bottom: 80 },
      { width: 1280, height: 800 },
      { width: 416, height: 500 },
    );
    expect(result).toEqual({ right: 16, bottom: 80 });
  });

  it("clamps negative values to zero", () => {
    const result = clampPanelPosition(
      { right: -50, bottom: -20 },
      { width: 1280, height: 800 },
      { width: 416, height: 500 },
    );
    expect(result).toEqual({ right: 0, bottom: 0 });
  });

  it("clamps bottom-right overflow so the panel stays on screen", () => {
    const result = clampPanelPosition(
      { right: 2000, bottom: 2000 },
      { width: 1280, height: 800 },
      { width: 416, height: 500 },
    );
    expect(result).toEqual({ right: 1280 - 416, bottom: 800 - 500 });
  });

  it("allows the panel to sit flush against edges", () => {
    const result = clampPanelPosition(
      { right: 0, bottom: 0 },
      { width: 1280, height: 800 },
      { width: 416, height: 500 },
    );
    expect(result).toEqual({ right: 0, bottom: 0 });
  });
});
