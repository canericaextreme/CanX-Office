/**
 * Password recovery: the office must offer a clear way back in, without
 * revealing who has an account and without weakening the owner/MFA gates.
 *
 * Source-level assertions, because the real flow needs a live Supabase
 * recovery email; mocking that away would prove nothing honest.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const gate = read("src/components/office/OfficeGate.tsx");
const provider = read("src/lib/owner-session.tsx");
const page = read("src/routes/auth/reset-password.tsx");

describe("sign-in screen recovery entry", () => {
  it("shows a plain Forgot password? control under the sign-in form", () => {
    expect(gate).toContain("Forgot password?");
    expect(gate.indexOf("Forgot password?")).toBeGreaterThan(gate.indexOf("Signing in…"));
  });

  it("prefills the recovery email from the sign-in email", () => {
    expect(gate).toContain("setRecoveryEmail(email.trim())");
  });

  it("asks for the email in the same card and can go back", () => {
    expect(gate).toContain("Reset your password");
    expect(gate).toContain("Back to sign in");
    expect(gate).toContain("session.requestPasswordReset(");
  });

  it("confirms generically and never says whether an email is registered", () => {
    expect(gate).toContain("Check your email for a secure password-reset link");
    expect(gate).not.toMatch(/not registered|unknown email|no such (account|user)|email not found/i);
  });

  it("keeps password-manager compatibility on both fields", () => {
    expect(gate).toContain('autoComplete="email"');
    expect(gate).toContain('autoComplete="current-password"');
    expect(gate).toContain('aria-label="Account email"');
  });
});

describe("reset request", () => {
  it("uses the official Supabase method with a same-origin redirect", () => {
    expect(provider).toContain("supabase.auth.resetPasswordForEmail(");
    expect(provider).toContain("${window.location.origin}/auth/reset-password");
    expect(provider).not.toContain("lovableproject.com");
    expect(provider).not.toContain("canx-office.lovable.app");
  });

  it("returns one actionable, non-revealing failure message", () => {
    expect(provider).toContain("The reset email could not be sent just now");
  });
});

describe("password update page", () => {
  it("uses the official update-user method and a minimum length", () => {
    expect(page).toContain("session.updatePassword(");
    expect(provider).toContain("supabase.auth.updateUser({ password: newPassword })");
    expect(page).toContain("MIN_LENGTH = 10");
    expect(page).toContain("password.length < MIN_LENGTH");
  });

  it("reports mismatch and expired links clearly", () => {
    expect(page).toContain("The two passwords do not match.");
    expect(page).toContain("This reset link has expired");
  });

  it("returns the user to the office afterwards", () => {
    expect(page).toContain("Your password is updated");
    expect(page).toContain('navigate({ to: "/" })');
  });

  it("has eye/eye-off controls on both password fields with clear labels", () => {
    expect(page).toContain("PasswordField");
    expect(page).toContain('type={shown ? "text" : "password"}');
    expect(page).toContain("EyeOff");
    expect(page).toContain('toggleName="new password"');
    expect(page).toContain('toggleName="confirmation password"');
    expect(page).toContain("`Hide ${toggleName}`");
    expect(page).toContain("`Show ${toggleName}`");
    expect(page).toContain("aria-pressed={shown}");
  });

  it("keeps new-password autocomplete and accessible field labels", () => {
    expect(page).toContain('autoComplete="new-password"');
    expect(page).toContain('label="New password"');
    expect(page).toContain('label="Confirm new password"');
    expect(page).toContain("aria-label={label}");
  });

  it("only trusts genuine recovery tokens, not an unrelated session", () => {
    expect(page).toContain('params.get("type") === "recovery"');
    expect(page).toContain('params.has("access_token")');
    expect(page).toContain('"PASSWORD_RECOVERY"');
    expect(page).toContain('params.get("error")');
  });
});

describe("update-password error mapping", () => {
  it("maps expired/missing recovery sessions to a fresh-link request", () => {
    expect(provider).toContain("session_not_found");
    expect(provider).toContain("request a fresh link");
  });

  it("maps password-policy rejections to a plain requirement explanation", () => {
    expect(provider).toContain("weak_password");
    expect(provider).toContain("not accepted by the password rules");
  });

  it("maps a reused password to a different-password request", () => {
    expect(provider).toContain("same_password");
    expect(provider).toContain("choose a different password");
  });

  it("never declares an unknown error to be an expired link", () => {
    expect(provider).toContain("could not be saved just now");
    const fallback = provider.slice(provider.indexOf("could not be saved just now"));
    expect(fallback).not.toContain("may have expired");
  });
});

describe("recovery does not weaken the office gates", () => {
  it("grants no role and skips no authenticator step-up", () => {
    expect(page).not.toContain("verifyOwner");
    expect(page).not.toContain("stepUpComplete");
    expect(page).not.toContain("has_role");
    expect(provider).toContain('stepUpComplete: state === "owner" && aal === "aal2"');
  });

  it("does not call the browser password manager the office password", () => {
    expect(gate).not.toMatch(/LastPass/i);
    expect(page).not.toMatch(/LastPass/i);
  });
});
