/**
 * CanX-owned external Supabase backend — SERVER ONLY, FAIL CLOSED.
 *
 * This module never provisions anything. It reads configuration that John
 * supplies for a Supabase project that CanX owns. While that configuration is
 * absent, every check below denies.
 *
 * Nothing here trusts the browser. The browser may send an access token; the
 * token is validated against the configured Supabase Auth server, and the
 * owner role and MFA assurance level are read from the verified result — never
 * from anything the client claims about itself.
 */

export interface BackendConfig {
  url: string;
  publishableKey: string;
}

export type OwnerDenyReason =
  | "backend_not_configured"
  | "no_session"
  | "invalid_session"
  | "expired_session"
  | "mfa_required"
  | "not_owner"
  | "backend_error";

export const DENY_MESSAGES: Record<OwnerDenyReason, string> = {
  backend_not_configured: "No CanX-owned database is configured yet, so sign-in is unavailable and nothing can be saved to a shared account.",
  no_session: "You are not signed in.",
  invalid_session: "That sign-in is not valid. Sign in again.",
  expired_session: "That sign-in has expired. Sign in again.",
  mfa_required: "Two-step verification is required. Complete the second step to continue.",
  not_owner: "This account is not the CanX owner account.",
  backend_error: "The CanX database could not be reached, so access was refused.",
};

export type OwnerVerification =
  | { ok: true; userId: string; email: string; aal: string }
  | { ok: false; reason: OwnerDenyReason; message: string };

function deny(reason: OwnerDenyReason): OwnerVerification {
  return { ok: false, reason, message: DENY_MESSAGES[reason] };
}

/** Configuration is read at call time, never at module scope. */
export function readBackendConfig(): BackendConfig | null {
  const url = process.env["CANX_SUPABASE_URL"];
  const publishableKey = process.env["CANX_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey) return null;
  return { url: url.replace(/\/+$/, ""), publishableKey };
}

/** Claims are only read AFTER the token has been validated by Supabase Auth. */
export function decodeClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Fetcher = typeof fetch;
const TIMEOUT_MS = 10_000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-verified owner identity. Default deny at every step.
 * Testable: configuration and fetch are injected.
 */
export async function verifyOwnerWith(
  config: BackendConfig | null,
  accessToken: string | undefined,
  fetchImpl: Fetcher = fetch,
): Promise<OwnerVerification> {
  if (!config) return deny("backend_not_configured");
  const token = (accessToken ?? "").trim();
  if (!token || token.split(".").length !== 3) return deny("no_session");

  let user: { id?: string; email?: string } | null = null;
  try {
    const response = await withTimeout((signal) =>
      fetchImpl(`${config.url}/auth/v1/user`, {
        signal,
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
      }),
    );
    if (response.status === 401 || response.status === 403) return deny("invalid_session");
    if (!response.ok) return deny("backend_error");
    user = (await response.json()) as { id?: string; email?: string };
  } catch {
    return deny("backend_error");
  }
  if (!user?.id) return deny("invalid_session");

  const claims = decodeClaims(token);
  if (!claims) return deny("invalid_session");
  const exp = typeof claims["exp"] === "number" ? claims["exp"] : 0;
  if (!exp || exp * 1000 <= Date.now()) return deny("expired_session");
  const aal = typeof claims["aal"] === "string" ? claims["aal"] : "aal1";
  if (aal !== "aal2") return deny("mfa_required");

  // Owner role comes from the database, checked as the signed-in user.
  try {
    const response = await withTimeout((signal) =>
      fetchImpl(`${config.url}/rest/v1/rpc/has_role`, {
        method: "POST",
        signal,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _user_id: user.id, _role: "owner" }),
      }),
    );
    if (!response.ok) return deny("backend_error");
    const isOwner = (await response.json()) as unknown;
    if (isOwner !== true) return deny("not_owner");
  } catch {
    return deny("backend_error");
  }

  return { ok: true, userId: user.id, email: user.email ?? "", aal };
}

export function verifyOwner(accessToken: string | undefined, fetchImpl: Fetcher = fetch) {
  return verifyOwnerWith(readBackendConfig(), accessToken, fetchImpl);
}

/* ------------------------------------------------------------------ */
/* Durable per-owner request-rate and spending limits                   */
/* ------------------------------------------------------------------ */

export type BudgetResult =
  | { allowed: true; reservationId: string; remainingToday: number }
  | { allowed: false; reason: "unavailable" | "rate_limit" | "budget_limit"; message: string };

/**
 * Reserves one paid AI call in the CanX database before the call happens.
 * If the limits cannot be reserved — table missing, database unreachable,
 * anything at all — the answer is deny, not allow.
 */
export async function reserveAiCallWith(
  config: BackendConfig | null,
  accessToken: string,
  estimatedCents: number,
  fetchImpl: Fetcher = fetch,
): Promise<BudgetResult> {
  if (!config) {
    return { allowed: false, reason: "unavailable", message: "Spending and rate limits are not configured, so paid AI calls are refused." };
  }
  try {
    const response = await withTimeout((signal) =>
      fetchImpl(`${config.url}/rest/v1/rpc/reserve_ai_call`, {
        method: "POST",
        signal,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _estimated_cents: estimatedCents }),
      }),
    );
    if (!response.ok) {
      return { allowed: false, reason: "unavailable", message: "Spending and rate limits could not be checked, so the AI call was refused." };
    }
    const row = (await response.json()) as
      | { allowed?: boolean; reason?: string; reservation_id?: string; remaining_today?: number }
      | Array<{ allowed?: boolean; reason?: string; reservation_id?: string; remaining_today?: number }>;
    const result = Array.isArray(row) ? row[0] : row;
    if (!result || result.allowed !== true || !result.reservation_id) {
      const reason = result?.reason === "budget_limit" ? "budget_limit" : result?.reason === "rate_limit" ? "rate_limit" : "unavailable";
      return {
        allowed: false,
        reason,
        message:
          reason === "budget_limit"
            ? "The AI spending limit for this period has been reached."
            : reason === "rate_limit"
              ? "Too many AI requests in a short time. Wait a moment and try again."
              : "Spending and rate limits could not be checked, so the AI call was refused.",
      };
    }
    return { allowed: true, reservationId: result.reservation_id, remainingToday: result.remaining_today ?? 0 };
  } catch {
    return { allowed: false, reason: "unavailable", message: "Spending and rate limits could not be checked, so the AI call was refused." };
  }
}

/** Best-effort settle of a reservation. Failure never widens access. */
export async function settleAiCallWith(
  config: BackendConfig | null,
  accessToken: string,
  reservationId: string,
  outcome: "ok" | "failed",
  fetchImpl: Fetcher = fetch,
): Promise<void> {
  if (!config) return;
  try {
    await withTimeout((signal) =>
      fetchImpl(`${config.url}/rest/v1/rpc/settle_ai_call`, {
        method: "POST",
        signal,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _reservation_id: reservationId, _outcome: outcome }),
      }),
    );
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Owner-scoped record access (RLS applies as the signed-in owner)      */
/* ------------------------------------------------------------------ */

export async function restRequest(
  config: BackendConfig,
  accessToken: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: Fetcher = fetch,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const response = await withTimeout((signal) =>
      fetchImpl(`${config.url}/rest/v1/${path}`, {
        ...init,
        signal,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(init.headers as Record<string, string> | undefined),
        },
      }),
    );
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}
