import { describe, expect, it } from "vitest";
import { directBuildRefusal, requestIsDiscussionOnly, stripBuilderHandoffPrefix, taskExecutionRefusal, taskIntakeKind } from "./builder-choice";

const task = "6e689bf0-065a-4fd6-b66f-48cb82fd09dc";
describe("John's broader Elsie intake", () => {
  it.each(["Prepare", "Draft", "Put together", "Work on", "Broaden"])("accepts %s for a saved task without rewriting its reference", verb => {
    const words = `${verb} the existing task ${task}`;
    expect(taskExecutionRefusal(words)).toBeNull();
    expect(stripBuilderHandoffPrefix(words)).toBe(words);
  });
  it.each(["Prepare", "Draft", "Put together", "Work on", "Broaden"])("recognizes %s campaign preparation with cost context", verb => {
    const words = `${verb} the We Belong campaign proposal with cost estimates`;
    expect(taskIntakeKind(words)).toBe("preparation");
    expect(directBuildRefusal(words, "codex")).not.toBeNull();
  });
  it("accepts the exact We Belong reference as an internal Elsie handoff", () => {
    const scope = `Prepare the We Belong campaign proposal with cost estimates; task ${task}`;
    const words = `Pass this to Elsie: ${scope}`;
    expect(stripBuilderHandoffPrefix(words)).toBe(scope);
    expect(taskExecutionRefusal(words)).toBeNull();
    expect(taskIntakeKind(words)).toBe("preparation");
    expect(taskExecutionRefusal("Pass this to Elsie")).not.toBeNull();
  });
  it.each([
    "Prepare the campaign proposal and buy the ads",
    "Draft the campaign proposal, then upgrade the subscription",
    "Put together cost estimates. Change the paid service plan",
    "Pass this to Elsie: pay the campaign invoice",
  ])("keeps actual transactions/plan changes separate: %s", words => {
    expect(taskIntakeKind(words)).toBe("owner-decision");
    expect(directBuildRefusal(words, "codex")).not.toBeNull();
  });
  it.each([
    "Never prepare the task", "Must not draft the task", "Do not prepare the task", "Don't draft the task", "No, broaden the task",
    "Work on the task, but wait", "Prepare the task; pause everything",
    "Pass this task to Elsie, but do not assign it", "Pass this task to Elsie, not yet", "Pass this task to Elsie, just discussing",
    "Pass this task to Elsie: imagine how we would prepare it",
    "How would you draft the task?", "For example, prepare the task",
    "Just discussing: broaden the task", "Put the campaign on hold. Draft the task",
  ])("respects discussion, negation and pauses: %s", words => {
    expect(requestIsDiscussionOnly(words)).toBe(true);
    expect(taskExecutionRefusal(words)).not.toBeNull();
    expect(directBuildRefusal(words, "codex")).not.toBeNull();
  });
  it.each(["Can you broaden the reception label?", "Work on the reception button spacing"])("retains ordinary Office change intake: %s", words => {
    expect(directBuildRefusal(words, "codex")).toBeNull();
  });
});
