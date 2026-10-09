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

/**
 * Descriptive references to approval that ALREADY exists ("John approved
 * this", "under John's existing authorisation", "as authorised") describe
 * context; they do not ask the Office to perform an approval. They are removed
 * only from the owner_approval check. They are never treated as a grant:
 * owner/authenticator/server verification still runs on every action, and all
 * other protected categories still examine the full original request.
 */
const DESCRIPTIVE_APPROVAL = new RegExp(
  [
    // "John (has|already|explicitly) approved/authorised …", "owner approved"
    String.raw`\b(?:john|the owner|owner|i|we)(?:['’]s)?\s+(?:has\s+|have\s+|had\s+)?(?:already\s+|explicitly\s+|previously\s+)*(?:approved|authori[sz]ed|signed off)\b`,
    // "approved/authorised by John/the owner", "already approved"
    String.raw`\b(?:already|previously|explicitly)\s+(?:been\s+)?(?:approved|authori[sz]ed)\b`,
    String.raw`\b(?:approved|authori[sz]ed)\s+by\s+(?:john|the owner|owner)\b`,
    // "as approved/authorised"
    String.raw`\bas\s+(?:approved|authori[sz]ed)\b`,
    // "with/under/per (John's|the owner's|existing|prior|current|standing) approval/authorisation"
    String.raw`\b(?:with|under|per|given|following|according to)\s+(?:john['’]s\s+|the owner['’]s\s+|owner['’]s\s+|my\s+)?(?:existing\s+|prior\s+|current\s+|standing\s+|explicit\s+|recorded\s+)*(?:approval|authori[sz]ation)\b`,
    // "John's (existing|current|standing) approval/authorisation"
    String.raw`\b(?:john['’]s|the owner['’]s|owner['’]s)\s+(?:existing\s+|prior\s+|current\s+|standing\s+|explicit\s+|recorded\s+)*(?:approval|authori[sz]ation)\b`,
    String.raw`\b(?:existing|prior|standing|recorded)\s+(?:owner\s+)?(?:approval|authori[sz]ation)\b`,
  ].join("|"),
  "gi",
);

/** Exposed for tests: the request text the owner_approval check examines. */
export function ownerApprovalScope(text: string): string {
  return text.toLowerCase().replace(DESCRIPTIVE_APPROVAL, " ");
}

/** Build requests prepare drafts; publication is a separate protected operation.
 * Ignore only explicit negative publish instructions, never the rest of a clause.
 * Ignore only descriptive references to existing approval for owner_approval.
 * Other protected categories still examine the original request.
 */
export function protectedBuildCategoryOf(request: string): ProtectedActionCategory | null {
  const text = request.toLowerCase();
  const publishText = text.replace(
    /\b(?:do\s+not|don['’]t|never|must\s+not|not\s+to|no)\s+(?:(?:auto(?:matically)?|automatically)[ -]?)?publish\b/g,
    "",
  );
  const approvalText = ownerApprovalScope(text);
  for (const category of PROTECTED_ACTION_CATEGORIES) {
    const matches = category === "publish_deploy"
      ? /\bpublish\b/.test(publishText)
      : category === "owner_approval"
        ? CATEGORY_WORDS.owner_approval.some((word) => approvalText.includes(word))
        : CATEGORY_WORDS[category].some((word) => text.includes(word));
    if (matches) return category;
  }
  return null;
}

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
