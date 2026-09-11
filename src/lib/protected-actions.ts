/**
 * Which office operations need the authenticator (AAL2 step-up).
 *
 * Ordinary office life — opening rooms, reading office content, holding a CanX
 * Chat conversation, asking the Office Manager for read-only status — needs
 * only ordinary sign-in. The categories below are John's protected actions and
 * always require the authenticator, whatever a model or a browser claims.
 *
 * Pure functions only: no network, no secrets, no state. The server decides
 * assurance level; this file only classifies the operation.
 */

export const PROTECTED_ACTION_CATEGORIES = [
  "owner_approval",
  "external_send",
  "purchase",
  "publish_deploy",
  "secrets_security",
  "role_ownership",
  "destructive",
  "protected_records",
] as const;

export type ProtectedActionCategory = (typeof PROTECTED_ACTION_CATEGORIES)[number];

export const AUTHENTICATOR_REQUIRED_MESSAGE =
  "Authenticator required for this action. It was not carried out.";

const CATEGORY_WORDS: Record<ProtectedActionCategory, string[]> = {
  owner_approval: ["approve", "approval", "authorize", "authorise", "sign_off"],
  external_send: ["send", "email", "invite", "dispatch", "notify_external", "post_external"],
  purchase: ["purchase", "buy", "subscribe", "payment", "spend", "billing", "charge"],
  publish_deploy: ["publish", "deploy", "release", "go_live", "production_change"],
  secrets_security: ["secret", "api_key", "token", "credential", "security_setting", "rls", "policy_change"],
  role_ownership: ["role", "grant", "revoke", "ownership", "transfer_owner", "permission"],
  destructive: ["delete", "drop", "destroy", "purge", "wipe", "irreversible", "reset_data", "migrate", "schema_change"],
  protected_records: ["finance_write", "receipt_write", "personal_record", "legacy_release", "legacy_policy"],
};

/** The protected category an operation falls in, or null for ordinary work. */
export function protectedCategoryOf(action: string, scope?: string): ProtectedActionCategory | null {
  const text = `${action} ${scope ?? ""}`.toLowerCase();
  for (const category of PROTECTED_ACTION_CATEGORIES) {
    if (CATEGORY_WORDS[category].some((word) => text.includes(word))) return category;
  }
  return null;
}

/** True when the operation may only run with the authenticator (AAL2). */
export function requiresAuthenticator(action: string, scope?: string): boolean {
  return protectedCategoryOf(action, scope) !== null;
}

/** Read-only office questions never step up. */
export function isReadOnlyRequest(action: string): boolean {
  const a = action.toLowerCase();
  const reads = ["read", "list", "get", "status", "summary", "view", "show", "ask_office_manager"];
  return !requiresAuthenticator(a) && reads.some((word) => a.includes(word));
}
