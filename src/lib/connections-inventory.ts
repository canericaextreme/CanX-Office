/**
 * Honest inventory of connections.
 *
 * Two groups that must never be confused:
 *  A) Accounts John verified in ChatGPT on 9 September 2026. These are NOT
 *     connections of this office. The embedded Office Manager cannot use them.
 *  B) Connections this office itself needs. Each shows as disconnected until it
 *     is actually configured and verified here.
 */

export interface ChatGptSnapshotRow {
  service: string;
  account: string;
}

export const CHATGPT_SNAPSHOT_LABEL = "Verified in ChatGPT on 9 Sep 2026; not a live office connection";

export const CHATGPT_SNAPSHOT: ChatGptSnapshotRow[] = [
  { service: "Lovable", account: "canerica14@gmail.com — workspace canericaextreme" },
  { service: "Gmail", account: "canericaextreme@gmail.com" },
  { service: "GitHub", account: "canericaextreme" },
  { service: "Google Drive", account: "canericaextreme@gmail.com" },
  { service: "Google Calendar", account: "canerica14@gmail.com" },
];

export type ConnectionStage = "required" | "next" | "planned";

export interface OfficeConnection {
  id: string;
  name: string;
  purpose: string;
  stage: ConnectionStage;
  /** Filled in at render time from real checks where one exists. */
  staticStatus?: "disconnected" | "planned";
  note?: string;
}

export const OFFICE_CONNECTIONS: OfficeConnection[] = [
  {
    id: "supabase",
    name: "CanX-owned database (Supabase)",
    purpose: "Owner sign-in with two-step verification, shared records across devices, history, backups.",
    stage: "required",
  },
  {
    id: "openai",
    name: "CanX-owned OpenAI account",
    purpose: "The Office Manager's answers. Blocked until owner sign-in works and spending limits are in place.",
    stage: "required",
  },
  {
    id: "claude",
    name: "Claude — independent reviewer",
    purpose: "A second opinion on plans and security. Nothing in this office speaks as Claude.",
    stage: "next",
    staticStatus: "disconnected",
  },
  {
    id: "gmail",
    name: "Gmail (scoped)",
    purpose: "Reading a narrow, agreed set of mail. Not switched on, and no mailbox monitoring exists.",
    stage: "next",
    staticStatus: "disconnected",
  },
  {
    id: "calendar",
    name: "Google Calendar (scoped)",
    purpose: "Reading and, later, proposing meetings. No calendar event or invitation is created today.",
    stage: "next",
    staticStatus: "disconnected",
  },
  {
    id: "github",
    name: "GitHub (scoped)",
    purpose: "Reading repository history for build and review work.",
    stage: "next",
    staticStatus: "disconnected",
  },
  {
    id: "drive",
    name: "Google Drive (scoped)",
    purpose: "Reading agreed folders of documents.",
    stage: "next",
    staticStatus: "disconnected",
  },
  {
    id: "safe-highways",
    name: "Safe Highways — read only",
    purpose: "Planned read-only view. Production is untouched and nothing writes to it.",
    stage: "planned",
    staticStatus: "planned",
  },
  {
    id: "trail-tales",
    name: "Trail Tales — read only",
    purpose: "Planned read-only view. Production is untouched and nothing writes to it.",
    stage: "planned",
    staticStatus: "planned",
  },
];

/** Where John completes the external database setup himself. */
export const SUPABASE_SETUP_URL = "https://lovable.dev/dashboard?connectors";
