/**
 * CanX ChatGPT Work — the companion's own written thinking surface.
 *
 * Completely INDEPENDENT of the Office Manager: no Manager request pipeline,
 * no manager tasks, no workbench state, no office AI spending guard. It cannot
 * change any office record and says so. The CanX-owned provider key stays on
 * the server; the browser only ever receives sanitized text.
 *
 * Ordinary sign-in (AAL1) is enough — thinking and drafting is ordinary work.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "@/lib/canx-backend.server";

export type WorkReplyCode =
  | "ok"
  | "auth_not_ready"
  | "not_configured"
  | "too_many_requests"
  | "provider_error";

export interface WorkReply {
  ok: boolean;
  code: WorkReplyCode;
  text: string;
  model: string | null;
  detail: string;
  /** Exact server setting John still has to supply, when that is the blocker. */
  missingSetting?: "OPENAI_API_KEY" | "OPENAI_WORK_MODEL";
}

export interface WorkMessage {
  role: "user" | "assistant";
  content: string;
}

export const WORK_SYSTEM_PROMPT = `You are the CanX Office Work assistant, the written work companion inside John Cantlon's CanX Office.

Who you are:
- You are NOT the Office Manager. The Office Manager is a separate part of the office with its own controls, tasks, approvals and records.
- You are NOT the ChatGPT conversation John may use elsewhere. You do not have its memory, history or connectors. Never claim to be it or to remember it.
- You help with thinking, drafting, analysis, comparisons, wording and planning, in writing.

Honesty:
- You cannot read, change, save or delete any office record, task, approval, receipt or setting. If John asks for that, say plainly that it belongs to the Office Manager, which he opens from its own control.
- Never claim you have sent an email, bought anything, deployed anything or changed shared data.
- Never invent office facts, amounts, dates or statuses. If you do not know, say so.
- Never read out or repeat keys, tokens, passwords or credentials.

Style: plain, direct English. Lead with the answer. Short paragraphs. No filler.`;

/* ------------------------- injectable dependencies ------------------------- */

export interface WorkDeps {
  verifySignedIn: (token: string) => Promise<OwnerVerification>;
  /** Work's OWN rate protection. Never the office/Manager spending guard. */
  allowRequest: (userId: string) => boolean;
  fetchImpl: typeof fetch;
  openaiKey: string | undefined;
  model: string | undefined;
}

const REQUEST_TIMEOUT_MS = 60_000;
export const WORK_MAX_MESSAGES = 20;
export const WORK_MAX_CHARS = 6000;

/** Work's own protection: a bounded number of written requests per account per hour. */
export const WORK_WINDOW_MS = 60 * 60 * 1000;
export const WORK_REQUEST_LIMIT = 40;

const requestTimes = new Map<string, number[]>();

export function allowWorkRequest(userId: string, now = Date.now()): boolean {
  const recent = (requestTimes.get(userId) ?? []).filter((t) => now - t < WORK_WINDOW_MS);
  if (recent.length >= WORK_REQUEST_LIMIT) {
    requestTimes.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestTimes.set(userId, recent);
  return true;
}

function readSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Never echo an upstream body, header, or key material back to the browser. */
export function sanitizedWorkDetail(status?: number): string {
  if (status === 401 || status === 403) return "The AI provider connection needs attention.";
  if (status === 404) return "The configured work model was not found on the CanX AI account.";
  if (status === 429) return "The AI service is temporarily busy. Please try again shortly.";
  if (status && status >= 500) return "The AI service could not be reached. Please try again.";
  return "The AI service could not be reached. Please try again.";
}

function deny(code: WorkReplyCode, detail: string, missing?: WorkReply["missingSetting"]): WorkReply {
  return { ok: false, code, text: "", model: null, detail, ...(missing ? { missingSetting: missing } : {}) };
}

export async function askWorkWith(
  deps: WorkDeps,
  accessToken: string,
  messages: WorkMessage[],
): Promise<WorkReply> {
  const verification = await deps.verifySignedIn(accessToken);
  if (!verification.ok) return deny("auth_not_ready", verification.message);

  if (!deps.openaiKey)
    return deny("not_configured", "No CanX-owned AI key is configured on the server.", "OPENAI_API_KEY");
  if (!deps.model)
    return deny(
      "not_configured",
      "No written work model is configured on the server yet.",
      "OPENAI_WORK_MODEL",
    );

  if (!deps.allowRequest(verification.userId))
    return deny("too_many_requests", "Work has made a lot of requests in the last hour. Please try again shortly.");

  const model = deps.model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await deps.fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.openaiKey}` },
      body: JSON.stringify({
        model,
        instructions: WORK_SYSTEM_PROMPT,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: 1200,
      }),
    });
    if (!response.ok) {
      console.error("[canx-work] provider request failed", response.status);
      return deny("provider_error", sanitizedWorkDetail(response.status));
    }
    const payload = (await response.json()) as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
      output_text?: string;
    };
    const text =
      payload.output_text ??
      (payload.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
    if (!text) return deny("provider_error", sanitizedWorkDetail());
    return { ok: true, code: "ok", text, model, detail: "" };
  } catch {
    return deny("provider_error", sanitizedWorkDetail());
  } finally {
    clearTimeout(timer);
  }
}

async function realDeps(): Promise<WorkDeps> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verifySignedIn: (token) => backend.verifySignedInWith(config, token),
    allowRequest: (userId) => allowWorkRequest(userId),
    fetchImpl: (input, init) => fetch(input, init),
    openaiKey: readSetting(process.env["OPENAI_API_KEY"]),
    // Explicit configuration only; the office never guesses a model.
    model: readSetting(process.env["OPENAI_WORK_MODEL"]) ?? readSetting(process.env["OPENAI_MODEL"]),
  };
}

export function sanitizeWorkInput(input: unknown): { accessToken: string; messages: WorkMessage[] } {
  const raw = input as { accessToken?: unknown; messages?: unknown };
  const accessToken = typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
  const messages = Array.isArray(raw?.messages)
    ? (raw.messages as unknown[])
        .filter((m): m is { role: string; content: string } => {
          const item = m as { role?: unknown; content?: unknown };
          return (item?.role === "user" || item?.role === "assistant") && typeof item?.content === "string";
        })
        .slice(-WORK_MAX_MESSAGES)
        .map((m) => ({ role: m.role as WorkMessage["role"], content: m.content.slice(0, WORK_MAX_CHARS) }))
    : [];
  return { accessToken, messages };
}

export const askCompanionWork = createServerFn({ method: "POST" })
  .inputValidator(sanitizeWorkInput)
  .handler(async ({ data }) => askWorkWith(await realDeps(), data.accessToken, data.messages));
