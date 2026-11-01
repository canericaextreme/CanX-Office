import { describe, expect, it } from "vitest";
import { isPresenceCheck } from "./manager.functions";
import { pendingQuestion, quickOfficeReply } from "./elsie-quick-reply";

describe("presence checks never re-run Office tools", () => {
  it.each(["Are you there?", "You there?", "Elsie, are you still there?", "Can you hear me?", "okay, are you there"])("%s", (text) => {
    expect(isPresenceCheck(text)).toBe(true);
  });
  it.each(["Yes.", "hello", "Let's do them.", "Are you there yet with the Finance task?", "Pull up each task", "OK."])("not: %s", (text) => {
    expect(isPresenceCheck(text)).toBe(false);
  });
});

describe("a greeting keeps Elsie's open question (31 Oct: 'Hello?' dropped the stale-task question)", () => {
  const asked = "I can clear out duplicates and dead work. Do you want me to use that rule for all 11 stale in-progress tasks?";
  it("repeats only the question she was waiting on", () => {
    expect(quickOfficeReply("Hello?", "/", null, asked)).toBe("I'm here, John. I was asking: Do you want me to use that rule for all 11 stale in-progress tasks?");
    expect(quickOfficeReply("Are you there?", "/", null, asked)).toContain("I was asking:");
  });
  it("keeps the plain greeting when nothing is pending", () => {
    expect(quickOfficeReply("Hello?", "/", null, "Done. Moved 3 tasks.")).toBe("I'm here, John. What can I help you with?");
    expect(quickOfficeReply("Hello?", "/", null)).toBe("I'm here, John. What can I help you with?");
    expect(pendingQuestion("?")).toBeNull();
  });
});
