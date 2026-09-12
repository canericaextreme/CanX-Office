/**
 * Server-only "observe the current Office view" call.
 *
 * Independent of the Office Manager: no Manager pipeline, no tasks, no office
 * spending guard, no tools, no database writes. Ordinary verified sign-in
 * (AAL1) is enough because looking at the page John is already looking at is
 * ordinary read-only work. The CanX-owned key never leaves the server and no
 * provider body, header or raw error is ever returned to the browser.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "@/lib/canx-backend.server";

export type ObserveCode =
  | "ok"
  | "auth_not_ready"
  | "not_configured"
  | "bad_input"
  | "too_many_requests"
  | "provider_error";

export interface ObserveReply {
  ok: boolean;
  code: ObserveCode;
  text: string;
  room: string;
  path: string;
  model: string | null;
  detail: string;
  missingSetting?: "OPENAI_API_KEY" | "OPENAI_WORK_MODEL";
}

export const OBSERVE_SYSTEM_PROMPT = `You are CanX ChatGPT Work looking at one screenshot of John Cantlon's own CanX Office page, taken only because he pressed "Observe Office".

Answer under the heading "Office observation" and be short and factual:
1. Which room or page is visible.
2. The important items, numbers and statuses actually shown on screen.
3. Anything unclear, cut off or unreadable — say so plainly.

Rules:
- Describe only what is visible. Never invent office facts, amounts, dates or statuses.
- You are NOT the Office Manager and you cannot change, save or delete any office record.
- Never read out keys, tokens, passwords or credentials.`;

export interface ObserveDeps {
  verifySignedIn: (token: string) => Promise<OwnerVerification>;
  allowRequest: (userId: string) => boolean;
  fetchImpl: typeof fetch;
  openaiKey: string | undefined;
  model: string | undefined;
}

const REQUEST_TIMEOUT_MS = 60_000;
export const OBSERVE_MAX_TEXT = 6000;
export const OBSERVE_MAX_IMAGE_CHARS = 1_600_000;
/** Conservative, and entirely separate from Work and from the Manager guard. */
export const OBSERVE_WINDOW_MS = 60 * 60 * 1000;
export const OBSERVE_REQUEST_LIMIT = 12;

const requestTimes = new Map<string, number[]>();

export function allowObserveRequest(userId: string, now = Date.now()): boolean {
  const recent = (requestTimes.get(userId) ?? []).filter((t) => now - t < OBSERVE_WINDOW_MS);
  if (recent.length >= OBSERVE_REQUEST_LIMIT) {
    requestTimes.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestTimes.set(userId, recent);
  return true;
}

/** Only a small, bounded inline JPEG or PNG of the office view is accepted. */
export function validImage(image: string): boolean {
  if (typeof image !== "string") return false;
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image)) return false;
  return image.length <= OBSERVE_MAX_IMAGE_CHARS;
}

export function sanitizedObserveDetail(status?: number): string {
  if (status === 401 || status === 403) return "The AI provider connection needs attention.";
  if (status === 404) return "The configured work model was not found on the CanX AI account.";
  if (status === 429) return "The AI service is temporarily busy. Please try again shortly.";
  if (status && status >= 500) return "The AI service could not be reached. Please try again.";
  return "The AI service could not be reached. Please try again.";
}

function readSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function deny(
  code: ObserveCode,
  detail: string,
  room: string,
  path: string,
  missing?: ObserveReply["missingSetting"],
): ObserveReply {
  return { ok: false, code, text: "", room, path, model: null, detail, ...(missing ? { missingSetting: missing } : {}) };
}

export interface ObservePayload {
  accessToken: string;
  path: string;
  room: string;
  text: string;
  image: string;
}

export function sanitizeObserveInput(input: unknown): ObservePayload {
  const raw = input as Partial<Record<keyof ObservePayload, unknown>>;
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  return {
    accessToken: str(raw?.accessToken, 4000),
    path: str(raw?.path, 200),
    room: str(raw?.room, 120),
    text: str(raw?.text, OBSERVE_MAX_TEXT),
    image: str(raw?.image, OBSERVE_MAX_IMAGE_CHARS + 1),
  };
}

export async function observeWith(deps: ObserveDeps, payload: ObservePayload): Promise<ObserveReply> {
  const { path, room } = payload;
  const verification = await deps.verifySignedIn(payload.accessToken);
  if (!verification.ok) return deny("auth_not_ready", verification.message, room, path);

  if (!validImage(payload.image))
    return deny("bad_input", "That office view could not be prepared for observation.", room, path);

  if (!deps.openaiKey)
    return deny("not_configured", "No CanX-owned AI key is configured on the server.", room, path, "OPENAI_API_KEY");
  if (!deps.model)
    return deny(
      "not_configured",
      "No written work model is configured on the server yet.",
      room,
      path,
      "OPENAI_WORK_MODEL",
    );

  if (!deps.allowRequest(verification.userId))
    return deny("too_many_requests", "Observe has run several times in the last hour. Please try again shortly.", room, path);

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
        instructions: OBSERVE_SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Room or page: ${room || "unknown"}\nPath: ${path || "unknown"}\n\nVisible text from this office view:\n${payload.text.slice(0, OBSERVE_MAX_TEXT)}`,
              },
              { type: "input_image", image_url: payload.image },
            ],
          },
        ],
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) {
      console.error("[canx-observe] provider request failed", response.status);
      return deny("provider_error", sanitizedObserveDetail(response.status), room, path);
    }
    const body = (await response.json()) as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
      output_text?: string;
    };
    const text =
      body.output_text ??
      (body.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
    if (!text) return deny("provider_error", sanitizedObserveDetail(), room, path);
    return { ok: true, code: "ok", text, room, path, model, detail: "" };
  } catch {
    return deny("provider_error", sanitizedObserveDetail(), room, path);
  } finally {
    clearTimeout(timer);
  }
}

async function realDeps(): Promise<ObserveDeps> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verifySignedIn: (token) => backend.verifySignedInWith(config, token),
    allowRequest: (userId) => allowObserveRequest(userId),
    fetchImpl: (input, init) => fetch(input, init),
    openaiKey: readSetting(process.env["OPENAI_API_KEY"]),
    model: readSetting(process.env["OPENAI_WORK_MODEL"]) ?? readSetting(process.env["OPENAI_MODEL"]),
  };
}

export const observeOfficeView = createServerFn({ method: "POST" })
  .inputValidator(sanitizeObserveInput)
  .handler(async ({ data }) => observeWith(await realDeps(), data));
