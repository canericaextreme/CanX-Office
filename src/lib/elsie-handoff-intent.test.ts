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

// 21 Oct 2026: John's real spoken requests were saved as tasks but never built,
// because the gate only accepted sentences that began with a command word.
describe("John's spoken requests reach the builder gate", () => {
  it.each(['Finish loop test PR230.', 'Finish this task.', 'Okay, continue the fix.', 'Resume the saved task.', 'Carry on with that job.', 'Keep working on the repair.', 'Continue working on the existing task.', 'Get the fix done.'])('accepts a clear saved-task continuation: %s', said => {
    expect(taskExecutionRefusal(said)).toBeNull();
    expect(directBuildRefusal(said, 'codex')).not.toBeNull();
  });
  it('accepts polite spoken build commands without a permissive any-clause search', () => {
    expect(directBuildRefusal('Okay, Elsie, could you start a new Codex build to fix the Reception label?', 'codex')).toBeNull();
    expect(directBuildRefusal('Elsie, I wonder whether we should start a new Codex build to fix the label.', 'codex')).not.toBeNull();
  });
  it.each(['Is the task finished?', 'We discussed continuing the fix.', 'Explain how to finish the task.', 'Finish the task, but do not send it yet.', 'Resume the saved task; read-only for now.', 'For example, finish loop test PR230.'])('keeps status, discussion and stop phrases inert: %s', said => {
    expect(taskExecutionRefusal(said)).not.toBeNull();
  });
  it("accepts a wish said after a spoken opener", () => {
    const said = "No, it's not done. I just opened up the Claude button and it's still a great big square with a whole bunch of useless stuff on it. I want the button just to open up the same as OpenChatGPT, and I want it to say work with Claude.";
    expect(directBuildRefusal(said, "claude")).toBeNull();
    expect(directBuildRefusal("Okay, fix the reception label", "codex")).toBeNull();
    expect(directBuildRefusal("Yeah. The Finance button should only say Receipts.", "codex")).toBeNull();
    expect(directBuildRefusal("Claude has to fix the reception label", "claude")).toBeNull();
    expect(directBuildRefusal("I want you to add a Trash view to the Work Board", "codex")).toBeNull();
  });
  it("accepts a spoken request to start a waiting task", () => {
    expect(taskExecutionRefusal("Yeah, you need to pass whatever task we have there waiting to fix the label.")).toBeNull();
    expect(taskExecutionRefusal("Okay. Go ahead and run the saved task.")).toBeNull();
  });
  it("still refuses pauses, status wishes and plain reports", () => {
    expect(directBuildRefusal("Okay, just put it on pause. I gotta fix the voice. Claude has to fix the voice.", "claude")).not.toBeNull();
    expect(directBuildRefusal("I want the status of the Work Board", "codex")).not.toBeNull();
    expect(directBuildRefusal("I want to know what is going on in the office", "codex")).not.toBeNull();
    expect(directBuildRefusal("Claude has build 15 running", "claude")).not.toBeNull();
    expect(directBuildRefusal("Okay, stop, stop.", "codex")).not.toBeNull();
    expect(taskExecutionRefusal("Just wondering what's still going on in the office.")).not.toBeNull();
  });
});

// 24 Oct 2026, John's own words from 21 Oct that Elsie refused ("No explicit request…").
describe("John's 21 Oct button requests reach a builder", () => {
  const said = [
    "Okay, separate the ChatGPT and the Claude buttons by a quarter inch.",
    "Yeah, just the ChatGPT and Claude buttons are overlapped, just separate them by a quarter inch.",
    "You already told me that. No explicit. It was explicit. On the mobile app, Office view, the ChatGPT and the cloud buttons are overlapped. Separate them so they both have their own tab.",
    "They need to be separated. They're overlapped. ChatGPT and Claude buttons are overlapped.",
    "Proceed with moving the Claude access to the bottom tab as described, and implement the change now.",
  ];
  it("accepts each as a build and as carrying out the saved task", () => {
    for (const request of said) {
      expect(directBuildRefusal(request, "codex")).toBeNull();
      expect(taskExecutionRefusal(request)).toBeNull();
    }
  });
  it("hears a spoken 'do it' for the job just saved", () => {
    for (const request of ["What do you mean no spread? I did say separate the tabs, ChatGPT and Claude. Put that into work.", "Go ahead.", "Okay, do it now.", "Get it done.", "Proceed with it."]) {
      expect(taskExecutionRefusal(request)).toBeNull();
    }
  });
  it("still refuses talk, stops and observations", () => {
    expect(taskExecutionRefusal("They're overlapping right now.")).not.toBeNull();
    expect(taskExecutionRefusal("Don't do it yet.")).not.toBeNull();
    expect(taskExecutionRefusal("Explain to me like I'm 10, why do you keep saying no explicit?")).not.toBeNull();
    expect(directBuildRefusal("I want the status of the Work Board", "codex")).not.toBeNull();
  });
  it("explains a refusal in plain words", () => {
    expect(taskExecutionRefusal("They're overlapping right now.")).toMatch(/^I didn't hear a change to make/);
    expect(taskExecutionRefusal("They're overlapping right now.")).not.toMatch(/explicit/i);
  });
});
