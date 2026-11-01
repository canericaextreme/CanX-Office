import { describe, expect, it } from "vitest";
import { uniqueParagraphs } from "./manager.functions";

describe("Elsie says each part of an answer once", () => {
  it("drops a repeated tool result and empty parts, keeping order", () => {
    const receipt = "Task build 1: success. Task evidence updated; completion remains unverified.";
    expect(uniqueParagraphs([receipt, "", receipt, "Next step.", ` ${receipt}  `])).toEqual([receipt, "Next step."]);
  });
});
