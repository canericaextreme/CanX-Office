import { describe, expect, it } from "vitest";
import { directBuildRefusal } from "./builder-choice";

// 28 Oct 2026: John asked for proof that the word "move" alone does not stop
// an Office build request. These tests pin the current behaviour: a plain move
// of something on screen is routine green build work, while every existing
// protected rule (deletion, publishing, legal, money) still applies to the
// whole request.
describe("Office build request gate — move requests", () => {
  it("accepts a plain request to move something on screen as routine work", () => {
    expect(directBuildRefusal("Claude, move the search box to the footer.", "claude")).toBeNull();
    expect(directBuildRefusal("Please move the Archive button next to the page title.", "codex")).toBeNull();
  });

  it("still refuses a move request that also deletes something", () => {
    expect(directBuildRefusal("Claude, move the old notes to the footer and delete the originals.", "claude"))
      .toContain("protected action (destructive)");
  });

  it("still refuses a move request that also publishes", () => {
    expect(directBuildRefusal("Claude, move the search box to the footer and publish it.", "claude"))
      .not.toBeNull();
  });
});
