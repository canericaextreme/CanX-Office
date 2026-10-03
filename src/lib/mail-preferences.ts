/**
 * Owner mail preferences: explicit Keep/Ignore choices John (or Elsie on John's
 * explicit instruction) saved. Deterministic and reversible — this is NOT model
 * training or self-learning. Stored as `mailPreferences` inside the owner-only
 * finance_receipts.doc beside the other keys (written via compare-and-swap).
 *
 * Precedence (highest first):
 *   1. message Keep   2. message Ignore   3. sender Keep   4. sender Ignore
 * A message choice applies only to that exact mailbox + Gmail message ID.
 * A sender rule applies to future mail only from that exact, normalized address,
 * and exists only when John explicitly asked for it (separate action).
 * Email text is never read as an instruction to create a rule.
 */
import type { SubscriptionEvidence } from "./subscriptions";

export type MailChoice = "keep" | "ignore";
export type PreferenceSource = "owner-ui" | "elsie-instruction";

export interface MessageDecision {
  mailbox: string; // lower-case verified mailbox
  messageId: string; // Gmail IDs are only unique within one mailbox
  choice: MailChoice;
  from: string;
  subject: string;
  decidedAt: string;
  source: PreferenceSource;
}

export interface SenderRule {
  sender: string; // exact normalized address
  action: MailChoice;
  createdAt: string;
  source: PreferenceSource;
  /** The message that prompted the rule, when created from the review list. */
  fromMessage?: { mailbox: string; messageId: string; subject: string };
}

export interface MailPreferences {
  version: 1;
  messages: MessageDecision[];
  senders: SenderRule[];
}

export const EMPTY_PREFERENCES: MailPreferences = { version: 1, messages: [], senders: [] };
export const MAX_MESSAGE_DECISIONS = 2_000;
export const MAX_SENDER_RULES = 200;

const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

/** "Name <A@B.com>" -> "a@b.com". Returns "" when not exactly one valid address. */
export function normalizeSender(from: string): string {
  const raw = String(from ?? "").trim();
  const angle = /<([^<>\s]+)>\s*$/.exec(raw);
  const candidate = (angle ? angle[1]! : raw).trim().toLowerCase();
  return EMAIL.test(candidate) ? candidate : "";
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const choice = (v: unknown): MailChoice | null => (v === "keep" || v === "ignore" ? v : null);
const source = (v: unknown): PreferenceSource => (v === "elsie-instruction" ? "elsie-instruction" : "owner-ui");

export function cleanMailPreferences(input: unknown): MailPreferences {
  if (!input || typeof input !== "object") return { ...EMPTY_PREFERENCES, messages: [], senders: [] };
  const raw = input as { messages?: unknown; senders?: unknown };
  const messages: MessageDecision[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(raw.messages) ? raw.messages.slice(0, MAX_MESSAGE_DECISIONS) : []) {
    const r = m as Record<string, unknown>;
    const c = choice(r["choice"]);
    const mailbox = str(r["mailbox"], 200).toLowerCase();
    const messageId = str(r["messageId"], 200);
    if (!c || !mailbox || !messageId) continue;
    const key = `${mailbox}|${messageId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({ mailbox, messageId, choice: c, from: str(r["from"], 300), subject: str(r["subject"], 300), decidedAt: str(r["decidedAt"], 40), source: source(r["source"]) });
  }
  const senders: SenderRule[] = [];
  const seenS = new Set<string>();
  for (const s of Array.isArray(raw.senders) ? raw.senders.slice(0, MAX_SENDER_RULES) : []) {
    const r = s as Record<string, unknown>;
    const a = choice(r["action"]);
    const sender = normalizeSender(str(r["sender"], 300));
    if (!a || !sender || seenS.has(sender)) continue;
    seenS.add(sender);
    const fm = r["fromMessage"] as Record<string, unknown> | undefined;
    senders.push({
      sender, action: a, createdAt: str(r["createdAt"], 40), source: source(r["source"]),
      ...(fm && typeof fm === "object" && str(fm["messageId"], 200)
        ? { fromMessage: { mailbox: str(fm["mailbox"], 200).toLowerCase(), messageId: str(fm["messageId"], 200), subject: str(fm["subject"], 300) } }
        : {}),
    });
  }
  return { version: 1, messages, senders };
}

export type PreferenceChange =
  | { op: "set-message"; mailbox: string; messageId: string; choice: MailChoice; from: string; subject: string }
  | { op: "clear-message"; mailbox: string; messageId: string }
  | { op: "set-sender"; sender: string; action: MailChoice; fromMessage?: { mailbox: string; messageId: string; subject: string } }
  | { op: "remove-sender"; sender: string };

/** Validates untrusted input into a change. Returns null for anything malformed. */
export function parsePreferenceChange(input: unknown): PreferenceChange | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const mailbox = str(r["mailbox"], 200).toLowerCase().trim();
  const messageId = str(r["messageId"], 200).trim();
  switch (r["op"]) {
    case "set-message": {
      const c = choice(r["choice"]);
      if (!c || !mailbox || !/^[A-Za-z0-9_-]{1,200}$/.test(messageId)) return null;
      return { op: "set-message", mailbox, messageId, choice: c, from: str(r["from"], 300), subject: str(r["subject"], 300) };
    }
    case "clear-message":
      if (!mailbox || !messageId) return null;
      return { op: "clear-message", mailbox, messageId };
    case "set-sender": {
      const a = choice(r["action"]);
      const sender = normalizeSender(str(r["sender"], 300));
      if (!a || !sender) return null;
      const fm = r["fromMessage"] as Record<string, unknown> | undefined;
      return {
        op: "set-sender", sender, action: a,
        ...(fm && typeof fm === "object" && str(fm["messageId"], 200)
          ? { fromMessage: { mailbox: str(fm["mailbox"], 200).toLowerCase(), messageId: str(fm["messageId"], 200), subject: str(fm["subject"], 300) } }
          : {}),
      };
    }
    case "remove-sender": {
      const sender = normalizeSender(str(r["sender"], 300));
      return sender ? { op: "remove-sender", sender } : null;
    }
    default:
      return null;
  }
}

export function applyPreferenceChange(prefs: MailPreferences, change: PreferenceChange, at: string, by: PreferenceSource): MailPreferences {
  const next: MailPreferences = { version: 1, messages: [...prefs.messages], senders: [...prefs.senders] };
  const sameMsg = (m: MessageDecision) => m.mailbox === (change as { mailbox?: string }).mailbox && m.messageId === (change as { messageId?: string }).messageId;
  if (change.op === "set-message") {
    next.messages = next.messages.filter((m) => !sameMsg(m));
    next.messages.unshift({ mailbox: change.mailbox, messageId: change.messageId, choice: change.choice, from: change.from, subject: change.subject, decidedAt: at, source: by });
    next.messages = next.messages.slice(0, MAX_MESSAGE_DECISIONS);
  } else if (change.op === "clear-message") {
    next.messages = next.messages.filter((m) => !sameMsg(m));
  } else if (change.op === "set-sender") {
    next.senders = next.senders.filter((s) => s.sender !== change.sender);
    next.senders.unshift({ sender: change.sender, action: change.action, createdAt: at, source: by, ...(change.fromMessage ? { fromMessage: change.fromMessage } : {}) });
    next.senders = next.senders.slice(0, MAX_SENDER_RULES);
  } else {
    next.senders = next.senders.filter((s) => s.sender !== change.sender);
  }
  return next;
}

/** True when the stored preferences reflect the change (used for readback verification). */
export function changeApplied(prefs: MailPreferences, change: PreferenceChange): boolean {
  if (change.op === "set-message") return prefs.messages.some((m) => m.mailbox === change.mailbox && m.messageId === change.messageId && m.choice === change.choice);
  if (change.op === "clear-message") return !prefs.messages.some((m) => m.mailbox === change.mailbox && m.messageId === change.messageId);
  if (change.op === "set-sender") return prefs.senders.some((s) => s.sender === change.sender && s.action === change.action);
  return !prefs.senders.some((s) => s.sender === change.sender);
}

export interface PreferenceVerdict {
  action: MailChoice | "none";
  reason: string;
}

/** Deterministic decision for one message. Never reads message body text. */
export function preferenceFor(prefs: MailPreferences, mailbox: string, messageId: string, from: string): PreferenceVerdict {
  const mb = mailbox.toLowerCase();
  const msg = prefs.messages.find((m) => m.mailbox === mb && m.messageId === messageId);
  if (msg) return { action: msg.choice, reason: msg.choice === "keep" ? "You chose Keep for this email." : "You chose Ignore for this email only." };
  const sender = normalizeSender(from);
  const rule = sender ? prefs.senders.find((s) => s.sender === sender) : undefined;
  if (rule) {
    return {
      action: rule.action,
      reason: rule.action === "keep"
        ? `You saved a Keep rule for future emails from ${sender}.`
        : `You saved an Ignore rule for future emails from exactly ${sender}.`,
    };
  }
  return { action: "none", reason: "" };
}

/** Whether ingestion should skip a message before reading bodies/attachments. */
export function shouldSkipMessage(prefs: MailPreferences, mailbox: string, messageId: string, from: string | null): boolean {
  const mb = mailbox.toLowerCase();
  const msg = prefs.messages.find((m) => m.mailbox === mb && m.messageId === messageId);
  if (msg) return msg.choice === "ignore";
  if (from === null) return false;
  return preferenceFor(prefs, mb, messageId, from).action === "ignore";
}

export const hasIgnoreSenderRules = (prefs: MailPreferences) => prefs.senders.some((s) => s.action === "ignore");

export type ReviewCategory = "related" | "needs-review" | "ignored";
export type ReviewFilter = "all" | ReviewCategory;

export interface ReviewRow {
  evidence: SubscriptionEvidence;
  category: ReviewCategory;
  why: string;
}

/** Saved mail (one row per mailbox+message) with category and reason. Nothing is removed. */
export function reviewRows(evidence: SubscriptionEvidence[], prefs: MailPreferences): ReviewRow[] {
  const byMessage = new Map<string, SubscriptionEvidence>();
  for (const e of evidence) {
    const key = `${e.mailbox.toLowerCase()}|${e.messageId}`;
    if (!byMessage.has(key)) byMessage.set(key, e);
  }
  return [...byMessage.values()].map((e) => {
    const verdict = preferenceFor(prefs, e.mailbox, e.messageId, e.from);
    if (verdict.action === "ignore") return { evidence: e, category: "ignored" as const, why: verdict.reason };
    if (verdict.action === "keep") return { evidence: e, category: "related" as const, why: verdict.reason };
    if (e.matchStatus === "matched") return { evidence: e, category: "related" as const, why: "Sender matches a saved office service." };
    const why =
      e.matchStatus === "unverified-sender" ? "Mentions a saved service, but the sender is not a known address for it."
        : e.matchStatus === "conflict" ? "Could belong to more than one saved service."
          : e.matchStatus === "personal" ? "Matches a service you marked personal."
            : "Looks like billing mail, but no saved service matched.";
    return { evidence: e, category: "needs-review" as const, why };
  });
}

export function filterRows(rows: ReviewRow[], filter: ReviewFilter): ReviewRow[] {
  return filter === "all" ? rows : rows.filter((r) => r.category === filter);
}

/** Plain summary for Elsie's context. Addresses and counts only — no email text. */
export function preferencesSummary(prefs: MailPreferences): string {
  const keep = prefs.senders.filter((s) => s.action === "keep").map((s) => s.sender);
  const ignore = prefs.senders.filter((s) => s.action === "ignore").map((s) => s.sender);
  const msgIgnore = prefs.messages.filter((m) => m.choice === "ignore").length;
  const msgKeep = prefs.messages.filter((m) => m.choice === "keep").length;
  return [
    `Mail rules saved by John (exact senders, future mail): Keep ${keep.length ? keep.join(", ") : "none"}; Ignore ${ignore.length ? ignore.join(", ") : "none"}.`,
    `Single-email choices: ${msgKeep} kept, ${msgIgnore} ignored.`,
    "Precedence: email Keep > email Ignore > sender Keep > sender Ignore. Unknown mail stays in Needs review.",
  ].join(" ");
}

/**
 * Deterministic parser for John's explicit typed/voice instructions to Elsie.
 * Only an exact email address in John's own words creates or removes a rule;
 * a vague request ("ignore promotions") is refused rather than guessed.
 */
export type MailRuleCommand =
  | { kind: "list" }
  | { kind: "set"; sender: string; action: MailChoice }
  | { kind: "remove"; sender: string }
  | { kind: "needs-address" };

export function parseMailRuleCommand(message: string): MailRuleCommand | null {
  const text = message.trim();
  if (text.length > 300 || /[\r\n]/.test(text)) return null;
  const lower = text.toLowerCase().replace(/^(?:elsie|astra|data)[, :]*/, "").replace(/^please\s+/, "");
  if (/^(?:show|list|what are)\b.{0,30}\b(?:mail|email|sender)\s+(?:rules|preferences|filters)\b/.test(lower)) return { kind: "list" };
  const addr = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24})/i.exec(text)?.[1] ?? "";
  const sender = normalizeSender(addr);
  if (/^(?:stop ignoring|remove (?:the )?(?:mail |email |sender )?rule (?:for|on)|forget (?:the )?(?:mail |email )?rule (?:for|on)|delete (?:the )?(?:mail |email |sender )?rule (?:for|on))\b/.test(lower)) {
    return sender ? { kind: "remove", sender } : { kind: "needs-address" };
  }
  const set = /^(always\s+)?(ignore|keep|download)\s+(?:all\s+)?(?:future\s+)?(?:e-?mails?|mail|messages)\s+from\b/.exec(lower);
  if (set) return sender ? { kind: "set", sender, action: set[2] === "ignore" ? "ignore" : "keep" } : { kind: "needs-address" };
  return null;
}
