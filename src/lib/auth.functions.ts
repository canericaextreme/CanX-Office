/**
 * Owner identity, verified on the server. Default deny.
 *
 * The browser sends an access token; nothing else it says about itself is
 * trusted. No secret is ever returned to the browser.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerDenyReason } from "@/lib/canx-backend.server";

export interface BackendStatus {
  /** A CanX-owned database has been configured on the server. */
  configured: boolean;
  /** Sign-in is possible at all. Same as configured — stated separately for clarity in the UI. */
  signInAvailable: boolean;
  detail: string;
}

export interface SessionResult {
  ok: boolean;
  reason: OwnerDenyReason | null;
  message: string;
  userId: string | null;
  email: string | null;
}

export const getBackendStatus = createServerFn({ method: "GET" }).handler(async (): Promise<BackendStatus> => {
  const { readBackendConfig } = await import("@/lib/canx-backend.server");
  const configured = Boolean(readBackendConfig());
  return {
    configured,
    signInAvailable: configured,
    detail: configured
      ? "A CanX-owned database is configured. Sign-in still has to succeed, with two-step verification, before anything is shared."
      : "No CanX-owned database is configured, so sign-in is unavailable and the office is running in device-only mode.",
  };
});

/**
 * The two values the sign-in screen needs. Both are publishable by design:
 * the project URL and the publishable key. No secret is ever returned here,
 * and holding these grants nothing — row access is decided by the database.
 */
export const getBrowserBackendConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ url: string; publishableKey: string } | null> => {
    const { readBackendConfig } = await import("@/lib/canx-backend.server");
    const config = readBackendConfig();
    if (!config) return null;
    return { url: config.url, publishableKey: config.publishableKey };
  },
);

function tokenOf(input: unknown): string {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
}

export const verifyOwnerSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: tokenOf(input) }))
  .handler(async ({ data }): Promise<SessionResult> => {
    const { verifyOwner } = await import("@/lib/canx-backend.server");
    const result = await verifyOwner(data.accessToken);
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message, userId: null, email: null };
    }
    return { ok: true, reason: null, message: "Signed in as the CanX owner with two-step verification.", userId: result.userId, email: result.email };
  });
