/**
 * Honest inventory of connections.
 *
 * Two groups that must never be confused:
 *  A) Accounts John verified in ChatGPT on 9 September 2026. These are NOT
 *     connections of this office. Neither Office assistant inherits these ChatGPT authorizations.
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
    name: "Claude — Office colleague and reviewer (Anthropic)",
    purpose:
      "Claude has a separate review and Office action path. Its Office requests share Elsie's tools, owner verification and budget controls. Requires its own server API key and an explicitly selected model; live access must be checked.",
    stage: "next",
  },

  {
    id: "gmail",
    name: "Gmail — billing mail and receipts",
    purpose: "Shared billing-mail and receipt retrieval for Elsie and Claude through the project-linked Gmail connection. General inbox reading and sending are not installed; no background mailbox monitor exists.",
    stage: "next",
    note: "Installed path; live mailbox authorization not verified here.",
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
    purpose: "Shared Office-only Claude/Codex draft builders and read-only build status for both assistants. Existing private server connection; live status must be checked.",
    stage: "next",
    note: "Installed path; live dispatch authorization must be checked.",
  },
  {
    id: "drive",
    name: "Google Drive (selected files only)",
    purpose:
      "Listing, reading, creating and updating Drive files visible to the office through the linked 'canerica's Google Drive' connection. Permission is selected-files only (drive.file): the office cannot browse the whole Drive. No delete action exists.",
    stage: "next",
    note: "Linked to this project; live signed-in verification not yet done.",
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
