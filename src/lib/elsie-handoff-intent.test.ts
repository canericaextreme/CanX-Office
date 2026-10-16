import { describe, expect, it } from "vitest";
import { requestIsDiscussionOnly, taskExecutionRefusal } from "./builder-choice";

describe("Elsie explicit handoff classification", () => {
  it("accepts an explicit Finance room handoff", () => {
    expect(requestIsDiscussionOnly("Elsie, pass this task to Claude: organize the Finance room and explain the categories")).toBe(false);
    expect(requestIsDiscussionOnly("Queue this job for Claude: improve Finance layout after the current build")).toBe(false);
  });
  it("accepts saved-task execution for a direct Claude handoff", () => {
    expect(taskExecutionRefusal("Elsie, pass this task to Claude: organize the Finance room")).toBeNull();
  });
  it("does not turn protected instructions into dispatches", () => {
    expect(requestIsDiscussionOnly("Elsie, pass this task to Claude, but do not send it yet")).toBe(true);
    expect(requestIsDiscussionOnly("Please pass this task to Claude for a read-only review")).toBe(true);
    expect(requestIsDiscussionOnly("For example, pass this task to Claude")).toBe(true);
  });
});

import { directBuildRefusal, requestAsksToQueue, stripBuilderHandoffPrefix } from "./builder-choice";

describe("Elsie handoff reaches the builder gate", () => {
  it("lets John's Finance handoff through the direct build gate", () => {
    expect(directBuildRefusal("Elsie, pass this task to Claude: organize the Finance room cards", "claude")).toBeNull();
    expect(directBuildRefusal("Send this task to Claude: tidy the Finance room headings", "claude")).toBeNull();
    expect(directBuildRefusal("Queue this job for Claude: rearrange the Finance room layout", "claude")).toBeNull();
  });
  it("still refuses protected Finance work and the wrong builder", () => {
    expect(directBuildRefusal("Elsie, pass this task to Claude: change the Finance spending limit", "claude")).toMatch(/protected/);
    expect(directBuildRefusal("Elsie, pass this task to Claude: organize the Finance room", "codex")).toMatch(/chose Claude/);
    expect(directBuildRefusal("Elsie, pass this task to Claude: add a button that will send an email to the bank", "claude")).toMatch(/protected/);
  });
  it("strips only the routing prefix", () => {
    expect(stripBuilderHandoffPrefix("Elsie, hand off this task to Claude: organize Finance")).toBe("organize Finance");
    expect(stripBuilderHandoffPrefix("organize Finance and send it to Claude")).toBe("organize Finance and send it to Claude");
  });
  it("recognizes a request to queue behind the current build", () => {
    expect(requestAsksToQueue("Queue this for Claude: tidy Finance")).toBe(true);
    expect(requestAsksToQueue("Pass this to Claude after the current build: tidy Finance")).toBe(true);
    expect(requestAsksToQueue("Pass this task to Claude: tidy Finance")).toBe(false);
  });
});
