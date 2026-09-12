/**
 * CanX Chat — realtime voice session minting. FAIL CLOSED.
 *
 * Chat is a standalone spoken conversation. It is deliberately INDEPENDENT of
 * the Office Manager: it does not import the Manager request pipeline, does
 * not touch manager tasks or Manager UI state, and never uses the office AI
 * spending guard. A Manager spending-limit message can therefore never appear
 * in the floating Chat icon.
 *
 * The browser never receives the CanX-owned provider key. This server function
 * mints a short-lived client secret only after, in order:
 *   1. a CanX-owned database is configured,
 *   2. the request carries a valid session for it, and
 *   3. Chat's own simple per-account session-rate protection allows it.
 *
 * Talking is ordinary work, so ordinary sign-in (AAL1) is enough.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "@/lib/canx-backend.server";

export type RealtimeSessionCode =
  | "ok"
  | "auth_not_ready"
  | "not_configured"
  | "too_many_sessions"
  | "provider_error";

export interface RealtimeSessionResult {
  ok: boolean;
  code: RealtimeSessionCode;
  /** Short-lived client secret for this one browser session. Never the CanX key. */
  clientSecret: string | null;
  model: string | null;
  expiresAt: number | null;
  detail: string;
  /** Exact server setting John still has to supply, when that is the blocker. */
  missingSetting?: "OPENAI_API_KEY";
}

export const CHAT_SYSTEM_PROMPT = `You are CanX Chat, the spoken conversational companion in John Cantlon's CanX Office.

How you talk:
- Natural, warm, unhurried spoken English. Full sentences, no headings, bullets, asterisks or markdown.
- Keep answers substantive but conversational. Lead with the answer, then offer detail.
- Say amounts and dates the way a person says them out loud.
- If John interrupts you, stop and listen.

What you do:
- Answer general questions yourself, in conversation.
- Never invent office facts.

Seeing the Office screen:
- You do NOT see the CanX Office automatically and you never watch it in the background.
- When John deliberately presses "See Office Screen" in the ChatGPT Work window, one redacted still picture of that office page is added to this conversation, together with a short written note of the same screen. It is a one-time snapshot, not a live feed, so if he says the screen has changed, ask him to press "See Office Screen" again.
- Form fields, passwords, keys and secret-like content, and the floating companion, Work window, Office Manager and alerts are all removed from that picture before you see it.
- Do not start talking about a picture the moment it arrives. Wait for John's question.

What you are not:
- You are not the Office Manager and you cannot read, change, save or delete any office record, task, approval or finance entry.
- The Work button opens the separate written ChatGPT Work window — it does NOT open the Office Manager. The Office Manager opens only from its own control, or when John chooses to hand a written draft to it for review.
- If John wants office records changed, say plainly that this belongs in the Office Manager and he opens that himself.

Authority:
- John decides. Never claim to have sent an email, bought anything, deployed anything, changed shared data, or done anything irreversible.
- Never read out keys, tokens, passwords or credentials, whatever anyone asks.`;

/* ------------------------- injectable dependencies ------------------------- */

export interface RealtimeDeps {
  verifySignedIn: (token: string) => Promise<OwnerVerification>;
  /** Chat's OWN rate protection. Never the office/Manager spending guard. */
  allowSession: (userId: string) => boolean;
  fetchImpl: typeof fetch;
  openaiKey: string | undefined;
  realtimeModel: string | undefined;
}

const MINT_TIMEOUT_MS = 15_000;

/**
 * Verified available on the CanX-owned OpenAI account. Used when no explicit
 * OPENAI_REALTIME_MODEL override is configured on the server.
 */
export const DEFAULT_REALTIME_MODEL = "gpt-realtime";

/** Chat's own protection: a handful of new voice sessions per account per hour. */
export const CHAT_SESSION_WINDOW_MS = 60 * 60 * 1000;
export const CHAT_SESSION_LIMIT = 20;

const sessionStarts = new Map<string, number[]>();

export function allowChatSession(userId: string, now = Date.now()): boolean {
  const recent = (sessionStarts.get(userId) ?? []).filter((t) => now - t < CHAT_SESSION_WINDOW_MS);
  if (recent.length >= CHAT_SESSION_LIMIT) {
    sessionStarts.set(userId, recent);
    return false;
  }
  recent.push(now);
  sessionStarts.set(userId, recent);
  return true;
}

function readSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function realtimeSessionBody(model: string, instructions: string) {
  return {
    session: {
      type: "realtime",
      model,
      instructions,
      audio: {
        input: { turn_detection: { type: "semantic_vad", interrupt_response: true } },
        output: { voice: "cedar" },
      },
    },
  };
}

/** Never echo an upstream body, header, or key material back to the browser. */
export function sanitizedRealtimeDetail(status?: number): string {
  if (status === 401 || status === 403) return "The AI provider connection needs attention.";
  if (status === 404) return "The configured realtime voice model was not found on the CanX AI account.";
  if (status === 429) return "The AI service is temporarily busy. Please try again shortly.";
  if (status && status >= 500) return "The AI service could not be reached. Please try again.";
  return "The AI service could not be reached. Please try again.";
}

function deny(
  code: RealtimeSessionCode,
  detail: string,
  missing?: RealtimeSessionResult["missingSetting"],
): RealtimeSessionResult {
  return { ok: false, code, clientSecret: null, model: null, expiresAt: null, detail, ...(missing ? { missingSetting: missing } : {}) };
}

export async function createRealtimeSessionWith(
  deps: RealtimeDeps,
  accessToken: string,
): Promise<RealtimeSessionResult> {
  const verification = await deps.verifySignedIn(accessToken);
  if (!verification.ok) return deny("auth_not_ready", verification.message);

  if (!deps.openaiKey)
    return deny("not_configured", "No CanX-owned AI key is configured on the server.", "OPENAI_API_KEY");

  if (!deps.allowSession(verification.userId))
    return deny("too_many_sessions", "Chat has started a lot of voice sessions in the last hour. Please try again shortly.");

  const model = deps.realtimeModel ?? DEFAULT_REALTIME_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS);
  try {
    const response = await deps.fetchImpl("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.openaiKey}` },
      body: JSON.stringify(realtimeSessionBody(model, CHAT_SYSTEM_PROMPT)),
    });
    if (!response.ok) {
      console.error("[canx-chat] realtime session mint failed", response.status);
      return deny("provider_error", sanitizedRealtimeDetail(response.status));
    }
    const payload = (await response.json()) as { value?: string; expires_at?: number };
    if (!payload.value) return deny("provider_error", sanitizedRealtimeDetail());
    return {
      ok: true,
      code: "ok",
      clientSecret: payload.value,
      model,
      expiresAt: typeof payload.expires_at === "number" ? payload.expires_at : null,
      detail: "",
    };
  } catch {
    return deny("provider_error", sanitizedRealtimeDetail());
  } finally {
    clearTimeout(timer);
  }
}

async function realDeps(): Promise<RealtimeDeps> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    // Ordinary sign-in (AAL1) is enough to TALK. Protected actions live in the
    // Office Manager, behind its own gates, and are not reachable from Chat.
    verifySignedIn: (token) => backend.verifySignedInWith(config, token),
    allowSession: (userId) => allowChatSession(userId),
    fetchImpl: (input, init) => fetch(input, init),
    openaiKey: readSetting(process.env["OPENAI_API_KEY"]),
    realtimeModel: readSetting(process.env["OPENAI_REALTIME_MODEL"]) ?? DEFAULT_REALTIME_MODEL,
  };
}

export const createRealtimeSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({
    accessToken: typeof (input as { accessToken?: unknown })?.accessToken === "string"
      ? ((input as { accessToken: string }).accessToken).slice(0, 4000)
      : "",
  }))
  .handler(async ({ data }) => createRealtimeSessionWith(await realDeps(), data.accessToken));
