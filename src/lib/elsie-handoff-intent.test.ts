import { describe, expect, it } from "vitest";
import { requestIsDiscussionOnly } from "./builder-choice";

describe("Elsie explicit handoff classification", () => {
  it("accepts an explicit Finance room handoff", () => {
    expect(requestIsDiscussionOnly("Elsie, pass this task to Claude: organize the Finance room and explain the categories")).toBe(false);
    expect(requestIsDiscussionOnly("Queue this job for Claude: improve Finance layout after the current build")).toBe(false);
  });
  it("does not turn protected instructions into dispatches", () => {
    expect(requestIsDiscussionOnly("Elsie, pass this task to Claude, but do not send it yet")).toBe(true);
    expect(requestIsDiscussionOnly("Please pass this task to Claude for a read-only review")).toBe(true);
    expect(requestIsDiscussionOnly("For example, pass this task to Claude")).toBe(true);
  });
});
