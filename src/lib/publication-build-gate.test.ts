import { describe, expect, it } from "vitest";
import { protectedBuildCategoryOf, requiresAuthenticator } from "./protected-actions";
import { officeBuildProtectedCategory } from "./codex-task-handoff";

describe("draft build publication gate", () => {
  it.each([
    "Build the room and deploy a preview",
    "Fetch an existing deploy URL and compare previews",
    "Generate a preview link",
    "View the deployed preview",
    "Build the room; do not publish anything",
    "Build the room; do not auto-publish anything",
    "Build the room; don't automatically publish anything",
    "Build the room; no auto-publish",
    "Build an unpublished preview",
  ])("allows preview wording: %s", (request) => {
    expect(protectedBuildCategoryOf(request)).toBeNull();
    expect(officeBuildProtectedCategory(request)).toBeNull();
  });
  it.each([
    "Build the room and publish to production",
    "Build the room and PUBLISH",
    "Do not publish the first preview. Publish the final version",
    "Do not auto-publish; then publish to production",
  ])("blocks an affirmative publish instruction: %s", (request) => {
    expect(officeBuildProtectedCategory(request)).toBe("publish_deploy");
  });
  it.each([
    ["Build a preview and delete data", "destructive"],
    ["Build a preview and email it externally", "external_send"],
    ["Build a preview and change credentials", "secrets_security"],
    ["Build a preview and purchase a subscription", "purchase"],
  ])("retains other protected categories: %s", (request, category) => {
    expect(officeBuildProtectedCategory(request)).toBe(category);
  });
  it("keeps actual deployment operations protected", () => {
    expect(requiresAuthenticator("deploy")).toBe(true);
    expect(requiresAuthenticator("publish")).toBe(true);
    expect(requiresAuthenticator("release")).toBe(true);
  });
  it("retains internal builder routing handling", () => {
    expect(officeBuildProtectedCategory("Build a preview. Send it to Codex.")).toBeNull();
  });
});
