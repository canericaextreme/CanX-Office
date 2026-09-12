import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signInSource = readFileSync("src/components/office/OwnerSignIn.tsx", "utf8");
const resetRouteSource = readFileSync("src/routes/auth/reset-password.tsx", "utf8");

describe("Owner sign-in password visibility toggle", () => {
  it("has an accessible show/hide control on the sign-in password field", () => {
    expect(signInSource).toContain("aria-label={showPassword ? \"Hide password\" : \"Show password\"}");
    expect(signInSource).toContain("aria-pressed={showPassword}");
    expect(signInSource).toContain("EyeOff");
    expect(signInSource).toContain("<Eye");
  });

  it("toggles only the field type and keeps password-manager compatibility", () => {
    expect(signInSource).toContain('type={showPassword ? "text" : "password"}');
    expect(signInSource).toContain('autoComplete="current-password"');
    // Large enough click target and keyboard focusable.
    expect(signInSource).toContain("w-11");
    expect(signInSource).toContain("focus-visible:ring-2");
  });

  it("does not change any authentication behaviour", () => {
    expect(signInSource).toContain("session.signIn(email, password)");
    expect(signInSource).toContain("session.submitMfaCode");
    expect(signInSource).not.toContain("resetPasswordForEmail");
    expect(signInSource).not.toContain("redirectTo");
  });

  it("leaves the reset-password page's existing eye controls untouched", () => {
    expect(resetRouteSource).toContain("EyeOff");
    expect(resetRouteSource).toContain("Show new password");
    expect(resetRouteSource).toContain("Hide confirmation password");
  });
});
