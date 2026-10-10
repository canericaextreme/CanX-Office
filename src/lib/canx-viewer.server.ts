/**
 * Read-only viewer verification — SERVER ONLY.
 *
 * PROPOSED. A viewer is an assistant's dedicated identity (see
 * docs/proposed/office-view-delegation.sql). It is NOT the owner. The ordinary
 * verifiers (verifyOwner, verifySignedIn) never accept it. Only the read-only
 * call sites listed in VIEWER_READ_SITES use the functions below, and the
 * database itself refuses every write from a viewer, so a mistake here cannot
 * turn into a change.
 *
 * Order of checks, default deny:
 *  1. Try the normal owner check. An owner is never treated as a viewer.
 *  2. Only if the owner check says "not the owner" or "needs two-step", ask the
 *     database (as the caller) whether this exact session is an open, bound
 *     viewer session under an active grant (canx_view_self).
 *  3. Anything else returns the ORIGINAL refusal, so a failed viewer attempt
 *     never reveals more than a failed owner attempt.
 */

import {
  DENY_MESSAGES,
  decodeClaims,
  verifyAccessWith,
  type BackendConfig,
  type OwnerVerification,
} from "./canx-backend.server";

type Fetcher = typeof fetch;

/** The only places allowed to accept a viewer. A test keeps this list and the source files in step. */
export const VIEWER_READ_SITES = [
  "src/lib/brain-index.functions.ts",
  "src/lib/project-register.functions.ts",
  "src/lib/room-snapshot.functions.ts",
  "src/lib/records.functions.ts",
  "src/lib/finance.functions.ts",
  "src/lib/subscriptions.functions.ts",
  "src/lib/legal-room.server.ts",
  "src/lib/mail-preferences.functions.ts",
  "src/lib/office-files.functions.ts",
] as const;

export async function verifyViewerWith(
  config: BackendConfig | null,
  accessToken: string | undefined,
  fetchImpl: Fetcher = fetch,
): Promise<OwnerVerification> {
  const refuse = (): OwnerVerification => ({ ok: false, reason: "not_owner", message: DENY_MESSAGES.not_owner });
  if (!config) return refuse();
  const token = (accessToken ?? "").trim();
  if (!token || token.split(".").length !== 3 || token.length > 8192) return refuse();
  try {
    const user = await fetchImpl(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!user.ok) return refuse();
    const profile = (await user.json()) as { id?: unknown };
    const claims = decodeClaims(token);
    if (!claims || typeof profile.id !== "string" || claims["sub"] !== profile.id) return refuse();
    // A viewer token is never an OAuth connector token and never a production owner token.
    if (claims["client_id"] != null) return refuse();
    const exp = claims["exp"];
    if (typeof exp !== "number" || exp * 1000 <= Date.now()) return refuse();
    const self = await fetchImpl(`${config.url}/rest/v1/rpc/canx_view_self`, {
      method: "POST",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!self.ok) return refuse();
    const rows = (await self.json()) as unknown;
    const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    if (!row || typeof row["owner_id"] !== "string" || typeof row["assistant"] !== "string") return refuse();
    const rooms = Array.isArray(row["rooms"]) ? (row["rooms"] as unknown[]).filter((r): r is string => typeof r === "string") : [];
    return { ok: true, userId: row["owner_id"], email: "", aal: "viewer", viewer: { assistant: row["assistant"], rooms } };
  } catch {
    return refuse();
  }
}

/** For read-only call sites: owner (as before) or, failing that, a confirmed viewer session. */
export async function verifyOwnerOrViewerReadWith(
  config: BackendConfig | null,
  accessToken: string | undefined,
  requireAal2: boolean,
  fetchImpl: Fetcher = fetch,
): Promise<OwnerVerification> {
  const owner = await verifyAccessWith(config, accessToken, requireAal2, fetchImpl);
  if (owner.ok) return owner;
  if (owner.reason !== "not_owner" && owner.reason !== "mfa_required") return owner;
  const viewer = await verifyViewerWith(config, accessToken, fetchImpl);
  return viewer.ok ? viewer : owner;
}

type Ordinary = (token: string | undefined) => Promise<OwnerVerification>;

/** Shared tail: try the ordinary verifier first; only a "not the owner"/"needs two-step" refusal may fall through to a confirmed viewer. */
async function ordinaryThenViewer(ordinary: Ordinary, accessToken: string | undefined): Promise<OwnerVerification> {
  const owner = await ordinary(accessToken);
  if (owner.ok) return owner;
  if (owner.reason !== "not_owner" && owner.reason !== "mfa_required") return owner;
  const b = await import("./canx-backend.server");
  const viewer = await verifyViewerWith(b.readBackendConfig(), accessToken);
  return viewer.ok ? viewer : owner;
}

/** Read-only call sites that previously used verifyOwner (authenticator required). */
export async function verifyOwnerOrViewerRead(accessToken: string | undefined): Promise<OwnerVerification> {
  const b = await import("./canx-backend.server");
  return ordinaryThenViewer(b.verifyOwner, accessToken);
}

/** Read-only call sites that previously used verifySignedIn. */
export async function verifySignedInOrViewerRead(accessToken: string | undefined): Promise<OwnerVerification> {
  const b = await import("./canx-backend.server");
  return ordinaryThenViewer(b.verifySignedIn, accessToken);
}
