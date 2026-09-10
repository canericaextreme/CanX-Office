import { describe, expect, it } from "vitest";
import { backupsNote, databaseStatus, nextStep } from "./systems-status";
import type { OwnerState } from "./owner-session";

const NON_OWNER_CONFIGURED_STATES: OwnerState[] = [
  "checking",
  "signed_out",
  "mfa_required",
  "not_owner",
  "error",
];

describe("database status row", () => {
  it("is green/connected when the owner is fully verified", () => {
    const status = databaseStatus({ state: "owner", configured: true });
    expect(status.tone).toBe("green");
    expect(status.note).toContain("Authenticated owner role");
    expect(status.note).toContain("two-step verification");
  });

  it("remains yellow/set-up-not-verified for configured but non-owner states", () => {
    for (const state of NON_OWNER_CONFIGURED_STATES) {
      const status = databaseStatus({ state, configured: true });
      expect(status.tone).toBe("yellow");
      expect(status.note).toBe("Configured. Sign-in still has to succeed.");
    }
  });

  it("is grey when the backend is missing", () => {
    const status = databaseStatus({ state: "backend_missing", configured: false });
    expect(status.tone).toBe("grey");
    expect(status.note).toContain("Not connected");
  });

  it("is grey for any non-owner state when not configured", () => {
    for (const state of NON_OWNER_CONFIGURED_STATES) {
      const status = databaseStatus({ state, configured: false });
      expect(status.tone).toBe("grey");
      expect(status.note).toContain("Not connected");
    }
  });
});

describe("backups row", () => {
  it("does not deny the account exists when owner is signed in", () => {
    const note = backupsNote({ state: "owner", configured: true });
    expect(note).toContain("Account exists");
    expect(note).toContain("not been tested");
    expect(note).not.toContain("no CanX-owned account");
  });

  it("keeps the honest not-configured wording for non-owner states", () => {
    for (const state of NON_OWNER_CONFIGURED_STATES) {
      const note = backupsNote({ state, configured: true });
      expect(note).toContain("no CanX-owned account");
    }
    expect(backupsNote({ state: "backend_missing", configured: false })).toContain("no CanX-owned account");
  });
});

describe("next step card", () => {
  it("says database/owner/MFA are complete and points to AI health check when owner is verified", () => {
    const step = nextStep({ state: "owner", configured: true, aiConnected: false, claudeConnected: false });
    expect(step.title).toBe("Verified so far");
    expect(step.paragraphs.join(" ")).toContain("Database, owner role, and two-step verification are complete");
    expect(step.paragraphs.join(" ")).toContain("live AI provider health check");
    expect(step.paragraphs.join(" ")).toContain("No AI provider is currently connected");
    expect(step.setupLink).toBe(false);
  });

  it("does not claim AI is connected when an AI provider is live", () => {
    const step = nextStep({ state: "owner", configured: true, aiConnected: true, claudeConnected: false });
    expect(step.paragraphs.join(" ")).not.toContain("No AI provider");
    expect(step.paragraphs.join(" ")).toContain("live AI provider health check");
  });

  it("keeps setup guidance before owner verification when configured but not signed in", () => {
    const step = nextStep({ state: "signed_out", configured: true, aiConnected: false, claudeConnected: false });
    expect(step.title).toBe("Your next step");
    expect(step.paragraphs.join(" ")).toContain("owner verification is not complete");
    expect(step.paragraphs.join(" ")).toContain("two-step verification");
    expect(step.setupLink).toBe(false);
  });

  it("keeps the Supabase setup link when the database is not configured", () => {
    const step = nextStep({ state: "backend_missing", configured: false, aiConnected: false, claudeConnected: false });
    expect(step.title).toBe("Your next step");
    expect(step.paragraphs.join(" ")).toContain("cannot create the database");
    expect(step.setupLink).toBe(true);
  });
});
