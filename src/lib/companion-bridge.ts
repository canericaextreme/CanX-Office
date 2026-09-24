/**
 * Small event bridge for the compact companion.
 *
 * The companion is self-contained: Chat is its own voice session and Work is
 * its own written panel (the "Office Work assistant"). Neither reaches the
 * Office Manager (Astra) on its own.
 *
 * The one deliberate exception is the handoff below, which happens ONLY when
 * John presses a hand-off button. It carries plain text for Astra's panel to
 * show as an editable, UNSENT draft. It never sends, saves, approves or spends.
 * Only John pressing "Send to Astra" in her panel submits it, through the
 * normal owner/MFA/budget-guarded Manager pipeline.
 */

export const COMPANION_OPEN_EVENT = "canx:open-companion";

export function openCompanion() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_OPEN_EVENT));
}

export const MANAGER_HANDOFF_EVENT = "canx:manager-handoff";
export const HANDOFF_STATUS_EVENT = "canx:manager-handoff-status";

export type HandoffSource = "screen_observation" | "work_discussion";

export interface ManagerHandoff {
  /** Sanitized, bounded text. Never an image, never a secret. */
  text: string;
  room: string;
  path: string;
  /** Stable id so status receipts can be matched back to this handoff. */
  id?: string;
  source?: HandoffSource;
}

export const HANDOFF_SOURCE_LABEL: Record<HandoffSource, string> = {
  screen_observation: "Office Work assistant — one screen snapshot (text only)",
  work_discussion: "Office Work assistant — selected written discussion",
};

/**
 * drafted   — placed in Astra's panel, not sent.
 * submitted — John pressed Send; waiting for the server.
 * responded — Astra answered; no office record was changed.
 * acted     — the server reports a real action was saved (done).
 * pending_approval — the server queued something for John's approval.
 * blocked   — refused before any provider call (sign-in, MFA, limits, health, records).
 * failed    — the result is unknown or the provider failed; do not auto-retry.
 */
export type HandoffStatus =
  | "drafted"
  | "submitted"
  | "responded"
  | "acted"
  | "pending_approval"
  | "blocked"
  | "failed";

export interface HandoffReceipt {
  id: string;
  status: HandoffStatus;
  detail: string;
  /** true / false only when the server reported durable save + readback. */
  persisted?: boolean;
  at: string;
}

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  drafted: "Draft — not sent",
  submitted: "Submitted — waiting for Astra",
  responded: "Astra responded — nothing changed",
  acted: "Astra saved a change",
  pending_approval: "Waiting for your approval",
  blocked: "Blocked — nothing was sent to the AI",
  failed: "Failed — result not confirmed",
};

/** Codes where the server refused BEFORE any paid provider call. Safe to resend. */
const PRE_PROVIDER_CODES = new Set([
  "auth_not_ready",
  "not_configured",
  "limit_blocked",
  "health_check_failed",
  "context_unavailable",
  "invalid_input",
]);

export interface ReplyLike {
  ok: boolean;
  code?: string;
  detail?: string;
  actionResults?: { status: "done" | "pending" | "stopped"; detail?: string }[];
  persisted?: boolean;
}

/** Status comes only from the real server result — never from the companion. */
export function handoffStatusFromReply(reply: ReplyLike | null | undefined): {
  status: HandoffStatus;
  detail: string;
  canResend: boolean;
} {
  if (!reply) {
    return {
      status: "failed",
      detail: "No reply was confirmed. Check the Work Board and Approvals before sending again.",
      canResend: false,
    };
  }
  if (!reply.ok) {
    const pre = PRE_PROVIDER_CODES.has(reply.code ?? "");
    return {
      status: pre ? "blocked" : "failed",
      detail: reply.detail || (pre ? "Refused before any AI call." : "The AI request did not complete."),
      canResend: pre,
    };
  }
  const actions = reply.actionResults ?? [];
  const done = actions.filter((a) => a.status === "done").length;
  const pending = actions.filter((a) => a.status === "pending").length;
  const saveNote =
    reply.persisted === true
      ? " Saved to Astra's memory."
      : reply.persisted === false
        ? " Not saved to Astra's memory — it will not be recalled after reload."
        : "";
  if (pending > 0)
    return { status: "pending_approval", detail: `${pending} item(s) queued for your approval.${saveNote}`, canResend: false };
  if (done > 0) return { status: "acted", detail: `${done} change(s) saved by the server.${saveNote}`, canResend: false };
  return { status: "responded", detail: `Astra answered. No office record was changed.${saveNote}`, canResend: false };
}

const SECRET_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/g, // provider keys
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  /\b[A-Za-z0-9_-]*(token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi,
  /data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(re, "[removed]"), text);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface WorkTurnLike {
  role: "user" | "assistant";
  content: string;
}

/**
 * Builds the reviewed draft for ONE selected exchange: the chosen user request
 * and the assistant reply right after it (if any). Never the whole chat.
 */
export function buildWorkHandoffDraft(turns: WorkTurnLike[], userIndex: number): string | null {
  const request = turns[userIndex];
  if (!request || request.role !== "user" || !request.content.trim()) return null;
  const next = turns[userIndex + 1];
  const recommendation = next?.role === "assistant" ? next.content.trim() : "";
  const lines = [
    "Handoff from the Office Work assistant (a discussion, not an approval).",
    "",
    `John's request: ${clip(redactSecrets(request.content.trim()), 1500)}`,
  ];
  if (recommendation)
    lines.push("", `Work assistant's suggestion (unverified): ${clip(redactSecrets(recommendation), 2000)}`);
  lines.push(
    "",
    "Astra: first restate the actionable request in plain words. Then report what you checked, what you changed (only real saved results), what remains, and the status. Treat this as an idea to discuss unless I clearly approve an action.",
  );
  return lines.join("\n").slice(0, 4000);
}

export function newHandoffId(): string {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Prefills a draft in the Office Manager. Explicit click only; nothing is sent. */
export function sendManagerHandoff(detail: ManagerHandoff) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ManagerHandoff>(MANAGER_HANDOFF_EVENT, { detail }));
}

export function publishHandoffReceipt(receipt: HandoffReceipt) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HandoffReceipt>(HANDOFF_STATUS_EVENT, { detail: receipt }));
}
