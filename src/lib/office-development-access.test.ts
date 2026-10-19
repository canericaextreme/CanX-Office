import { describe, expect, it } from "vitest";
import { canBrowseOfficeWithoutSignIn } from "./office-development-access";

describe("temporary development browsing", () => {
  it("allows browsing without sign-in while building in development", () => {
    expect(canBrowseOfficeWithoutSignIn(true)).toBe(true);
  });
  it("keeps the published office sign-in requirement", () => {
    expect(canBrowseOfficeWithoutSignIn(false)).toBe(false);
  });
});