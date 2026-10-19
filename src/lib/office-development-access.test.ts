import { describe, expect, it } from "vitest";
import { canBrowseOfficeWithoutSignIn, OFFICE_BUILD_IN_PROGRESS } from "./office-development-access";

describe("temporary development browsing", () => {
  it("allows browsing without sign-in while building in development", () => {
    expect(canBrowseOfficeWithoutSignIn(true)).toBe(true);
  });
  it("keeps entrance sign-in off in compiled previews until John finishes the build", () => {
    expect(OFFICE_BUILD_IN_PROGRESS).toBe(true);
    expect(canBrowseOfficeWithoutSignIn(false)).toBe(true);
  });
});