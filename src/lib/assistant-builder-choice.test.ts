import { describe, it, expect } from "vitest";
import { builderChoiceFor, directBuildRefusal } from "./builder-choice";
import { validWorkArguments } from "./office-mcp-work";

describe("assistant-selected builders", () => {
  it("uses the assistant preference only when the owner did not select a builder", () => {
    expect(builderChoiceFor("Build a blue button", "claude")).toEqual({builder:"claude",named:false});
    expect(builderChoiceFor("Codex, build a blue button", "claude")).toEqual({builder:"codex",named:true});
    expect(builderChoiceFor("Claude, build a blue button", "codex")).toEqual({builder:"claude",named:true});
    expect(builderChoiceFor("Claude or Codex, build it", "claude")).toEqual({conflict:true});
  });
  for (const request of ["Let's build this", "Okay, let's build this", "Okay, let's go build it", "Let’s build this", "Build a blue button"]) {
    it("accepts a natural explicit build command: "+request, () => {
      expect(directBuildRefusal(request, "claude")).toBeNull();
      expect(directBuildRefusal(request, "codex")).toBeNull();
    });
  }
  for (const request of ["How would you build this?", "Do not build this", "Check Claude builds", "Build this and publish it", "Build this and email a customer"]) {
    it("does not turn discussion, status or protected work into a build: "+request, () => {
      expect(directBuildRefusal(request, "claude")).not.toBeNull();
    });
  }
  it("does not override an explicit owner choice", () => {
    expect(directBuildRefusal("Codex, build this", "claude")).not.toBeNull();
    expect(directBuildRefusal("Claude, build this", "codex")).not.toBeNull();
  });
  it("accepts exactly the known optional builder values through the shared tool schema", () => {
    const args={requestId:"00000000-0000-4000-8000-000000000001",request:"Build a blue button"};
    expect(validWorkArguments("submit_office_build",args)).toBe(true);
    expect(validWorkArguments("submit_office_build",{...args,builder:"claude"})).toBe(true);
    expect(validWorkArguments("submit_office_build",{...args,builder:"codex"})).toBe(true);
    expect(validWorkArguments("submit_office_build",{...args,builder:"other"})).toBe(false);
    expect(validWorkArguments("submit_office_build",{...args,provider:"claude"})).toBe(false);
  });
});
