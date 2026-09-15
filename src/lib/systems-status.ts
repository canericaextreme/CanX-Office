/**
 * Small, pure helpers for the Systems page status rows.
 *
 * They only turn already-verified session facts into wording and a colour.
 * They never check anything themselves, never call a provider, and never
 * assert a connection the session has not already proven.
 */

export type StatusTone = "green" | "yellow" | "grey";

export interface StatusRowState {
  tone: StatusTone;
  note: string;
}

/**
 * CanX-owned database.
 *
 * Green only when the database is configured AND the browser holds a verified
 * owner session. An owner session proves sign-in and the owner role; it does
 * not prove two-step verification, which is only checked when a protected
 * action is attempted.
 */
export function databaseRowState(configured: boolean, isOwner: boolean): StatusRowState {
  if (!configured) {
    return { tone: "grey", note: "Not connected. Sign-in and shared saving are unavailable." };
  }
  if (isOwner) {
    return {
      tone: "green",
      note: "Connected. Your owner role was confirmed by the database. Two-step verification is checked separately, when a protected action is attempted.",
    };
  }
  return { tone: "yellow", note: "Configured. Sign-in still has to succeed." };
}

/**
 * Backups and restore.
 *
 * With a verified owner session the CanX-owned account plainly exists, so the
 * honest statement is that backup and restore have not been tested — not that
 * there is nothing to back up.
 */
export function backupsRowState(configured: boolean, isOwner: boolean): StatusRowState {
  if (isOwner) {
    return {
      tone: "yellow",
      note: "Your CanX-owned account exists, but backup and restore have not been tested yet.",
    };
  }
  if (configured) {
    return { tone: "grey", note: "Not tested. Sign in as the owner before any backup can be checked." };
  }
  return { tone: "grey", note: "Not tested. There is no CanX-owned account to back up yet." };
}
