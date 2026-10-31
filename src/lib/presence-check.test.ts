import { describe, expect, it } from "vitest";
import { isPresenceCheck } from "./manager.functions";

describe("presence checks never re-run Office tools", () => {
  it.each(["Are you there?", "You there?", "Elsie, are you still there?", "Can you hear me?", "okay, are you there"])("%s", (text) => {
    expect(isPresenceCheck(text)).toBe(true);
  });
  it.each(["Yes.", "hello", "Let's do them.", "Are you there yet with the Finance task?", "Pull up each task", "OK."])("not: %s", (text) => {
    expect(isPresenceCheck(text)).toBe(false);
  });
});
