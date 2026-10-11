/**
 * Whether ChatGPT and Claude are actually signed in to the Office connector. Pure: no network.
 * Approval and consent can stay in place while the sign-in itself is gone: Supabase Auth deletes
 * every lower-level (aal1) session, which includes every assistant connection, each time the
 * owner verifies an authenticator code.
 */
export const CONNECTION_ASSISTANTS = ["chatgpt", "claude"] as const;
export type ConnectionAssistant = (typeof CONNECTION_ASSISTANTS)[number];

/** Shown wherever the owner is asked for an authenticator code. */
export const AUTHENTICATOR_SIGNS_OUT_ASSISTANTS =
  "Entering your authenticator code signs ChatGPT and Claude out of the Office connector. Their approval stays; reconnect each one afterwards from its own app.";
/** The consent page variant: the assistant being connected now is unaffected, any other is signed out. */
export const CONSENT_CODE_SIGNS_OUT_OTHER =
  "Entering your code here signs out any assistant that is already connected. Its approval stays; reconnect it after this one.";

export interface ConnectionRow {
  identity: string;
  enabled: boolean;
  consent_active: boolean;
  live_sessions: number;
  last_active_at: string | null;
}

export type ConnectionState = "connected" | "needs_reconnect" | "not_approved" | "unknown";

export function describeConnection(
  row: ConnectionRow | undefined,
  known: boolean,
): { state: ConnectionState; label: string } {
  if (!known)
    return {
      state: "unknown",
      label:
        "Connection could not be checked. Missing information is not the same as disconnected.",
    };
  if (!row || !row.enabled || !row.consent_active)
    return { state: "not_approved", label: "Not approved for Office working access." };
  if (row.live_sessions > 0)
    return {
      state: "connected",
      label: `Signed in${row.last_active_at ? `, last active ${new Date(row.last_active_at).toLocaleString()}` : ""}.`,
    };
  return {
    state: "needs_reconnect",
    label:
      "Approved, but signed out. Reconnect the CanX Office connector from this assistant's own app. Do not enter an authenticator code afterwards.",
  };
}

export function cleanConnectionRows(body: unknown): ConnectionRow[] | null {
  if (!Array.isArray(body)) return null;
  const rows: ConnectionRow[] = [];
  for (const r of body as Record<string, unknown>[]) {
    if (
      !r ||
      typeof r["identity"] !== "string" ||
      typeof r["enabled"] !== "boolean" ||
      typeof r["consent_active"] !== "boolean" ||
      typeof r["live_sessions"] !== "number"
    )
      return null;
    rows.push({
      identity: r["identity"],
      enabled: r["enabled"],
      consent_active: r["consent_active"],
      live_sessions: r["live_sessions"],
      last_active_at: typeof r["last_active_at"] === "string" ? r["last_active_at"] : null,
    });
  }
  return rows;
}
