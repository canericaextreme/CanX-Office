/**
 * Office access rules: ordinary sign-in opens the office and Chat; the
 * authenticator is a step-up for protected actions only.
 *
 * Source-level assertions are used where a real session would be required, so
 * the checks stay honest rather than mocking away the security gates.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PROTECTED_ACTION_CATEGORIES,
  isReadOnlyRequest,
  protectedCategoryOf,
  requiresAuthenticator,
} from "@/lib/protected-actions";

const read = (path: string) => readFileSync(path, "utf8");

describe("protected action classification", () => {
  it("requires the authenticator for every protected category", () => {
    const samples: Record<(typeof PROTECTED_ACTION_CATEGORIES)[number], string> = {
      owner_approval: "approve_expense",
      external_send: "send_email",
      purchase: "purchase_subscription",
      publish_deploy: "publish_site",
      secrets_security: "rotate_api_key",
      role_ownership: "grant_role",
      destructive: "delete_project",
      protected_records: "finance_write",
    };
    for (const category of PROTECTED_ACTION_CATEGORIES) {
      expect(protectedCategoryOf(samples[category])).toBe(category);
      expect(requiresAuthenticator(samples[category])).toBe(true);
    }
  });

  it("leaves ordinary read-only office work at ordinary sign-in", () => {
    for (const action of ["list_tasks", "get_status", "ask_office_manager", "show_summary"]) {
      expect(requiresAuthenticator(action)).toBe(false);
      expect(isReadOnlyRequest(action)).toBe(true);
    }
  });
});

describe("office entry gate", () => {
  const gate = read("src/components/office/OfficeGate.tsx");
  const layout = read("src/routes/_office.tsx");

  it("shows a neutral opening state while the session is checked", () => {
    expect(gate).toContain("Opening CanX Office…");
    expect(gate).toContain('session.state === "checking"');
  });

  it("shows the sign-in screen when there is no valid session", () => {
    expect(gate).toContain("Sign in to open the office");
    expect(gate).toContain("session.signIn(");
  });

  it("enters the office directly for a valid session and keeps device-only mode", () => {
    expect(gate).toContain('session.state === "owner"');
    expect(gate).toContain('session.state === "backend_missing"');
  });

  it("does not ask for the authenticator to open the office", () => {
    expect(gate).not.toContain("submitMfaCode");
  });

  it("wraps the whole office interior in the gate", () => {
    expect(layout).toContain("<OfficeGate>");
    expect(layout).toContain("<OfficeInterior />");
  });
});

describe("account menu", () => {
  const menu = read("src/components/office/AccountMenu.tsx");
  const nav = read("src/components/office/OfficeNav.tsx");
  const companion = read("src/components/office/CompanionDock.tsx");

  it("offers sign out from the header account menu, not the companion", () => {
    expect(menu).toContain("session.signOut()");
    expect(nav).toContain("<AccountMenu />");
    expect(companion).not.toContain("signOut");
  });

  it("offers the authenticator step-up in the account menu", () => {
    expect(menu).toContain("submitMfaCode");
  });
});

describe("ordinary sign-in is enough for Chat and read-only manager work", () => {
  const realtime = read("src/lib/realtime-voice.functions.ts");
  const manager = read("src/lib/manager.functions.ts");

  it("mints the realtime voice session at ordinary sign-in", () => {
    expect(realtime).toContain("verifySignedInWith(config, token)");
    expect(realtime).not.toContain("verifyOwnerWith(config, token)");
  });

  it("uses the ordinary check for manager status and chat", () => {
    expect(manager).toContain("verifySignedIn: (token) => backend.verifySignedInWith(config, token)");
    expect(manager).toContain("(deps.verifySignedIn ?? deps.verifyOwner)(accessToken)");
    expect(manager).toContain("(deps.verifySignedIn ?? deps.verifyOwner)(data.accessToken)");
  });

  it("still demands the authenticator before any protected tool call runs", () => {
    expect(manager).toContain("protectedCategoryOf(");
    expect(manager).toContain("Authenticator required for this action");
    expect(manager).toContain("stepUp ??= await deps.verifyOwner(accessToken)");
  });

  it("keeps the strict check for the workbench", () => {
    const workbench = read("src/lib/manager-work.functions.ts");
    expect(workbench).toContain("verifyOwner");
  });
});

describe("session handling", () => {
  const provider = read("src/lib/owner-session.tsx");

  it("records the verified assurance level from the server", () => {
    expect(provider).toContain('result.aal === "aal2" ? "aal2" : "aal1"');
    expect(provider).toContain('stepUpComplete: state === "owner" && aal === "aal2"');
  });

  it("returns cleanly to signed out and clears the level", () => {
    expect(provider).toContain("setAal(null)");
    expect(provider).toContain('setState(configured ? "signed_out" : "backend_missing")');
  });

  it("relies on the existing Supabase session, not invented storage", () => {
    expect(provider).toContain("supabase.auth.getSession()");
    expect(provider).not.toContain("localStorage.setItem");
  });
});
