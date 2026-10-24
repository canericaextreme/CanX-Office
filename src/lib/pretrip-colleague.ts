/**
 * Pre-trip two-way message test with the Office's own API colleagues
 * (OpenAI "ChatGPT" and Anthropic "Claude" keys held by the Office).
 *
 * John approved this paid test on 24 Oct 2026: one tiny message per colleague
 * per inspection, inside the existing AI budget reservation. It proves
 * send -> provider reply -> Elsie receives it, by a one-time code the reply
 * must echo, plus one shared Work Board title the reply must quote back.
 * It is NOT a test of John's native ChatGPT or Claude chat apps.
 */
import type { ColleagueTest } from "./pretrip";

export type Colleague = "chatgpt" | "claude";
export const PING_ESTIMATED_CENTS = 1;
export const PING_TIMEOUT_MS = 20_000;
export const PING_MAX_TOKENS = 60;

export interface PingDeps {
  fetchImpl: typeof fetch;
  openaiKey?: string | undefined;
  openaiModel?: string | undefined;
  anthropicKey?: string | undefined;
  anthropicModel?: string | undefined;
  reserve: (cents: number) => Promise<{ allowed: true; reservationId: string } | { allowed: false; message: string }>;
  settle: (reservationId: string, outcome: "ok" | "failed") => Promise<void>;
  nowMs?: () => number;
}

export function pingPrompt(code: string, sharedTitle: string): string {
  return `CanX Office pre-trip communication test from Elsie. Reply on one line with exactly: PRETRIP-OK ${code} | then the first five words of this shared Work Board task title: "${sharedTitle.slice(0, 120)}". No other text.`;
}

/** The reply must carry the one-time code and quote the shared title back. */
export function verifyPingReply(text: string, code: string, sharedTitle: string): { code: boolean; shared: boolean } {
  const words = sharedTitle.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 3);
  const lower = text.toLowerCase();
  return { code: text.includes(`PRETRIP-OK ${code}`), shared: words.length > 0 && words.every((w) => lower.includes(w)) };
}

export async function pingColleague(deps: PingDeps, c: Colleague, code: string, sharedTitle: string): Promise<ColleagueTest> {
  const claude = c === "claude";
  const key = claude ? deps.anthropicKey : deps.openaiKey;
  const model = claude ? deps.anthropicModel : deps.openaiModel;
  const base: ColleagueTest = { colleague: c, sent: false, replied: false, verified: false, ms: null, responseId: null, model: model ?? null, failure: null };
  if (!key || !model) return { ...base, failure: "not configured in the Office (key or model missing); nothing sent" };
  const reservation = await deps.reserve(PING_ESTIMATED_CENTS).catch(() => ({ allowed: false as const, message: "budget could not be checked" }));
  if (!reservation.allowed) return { ...base, failure: `budget control refused the call: ${reservation.message.slice(0, 120)}; nothing sent` };
  const now = deps.nowMs ?? Date.now;
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const prompt = pingPrompt(code, sharedTitle);
  let ok = false;
  try {
    const res = await deps.fetchImpl(claude ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal, redirect: "manual",
      headers: claude
        ? { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }
        : { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(claude
        ? { model, max_tokens: PING_MAX_TOKENS, messages: [{ role: "user", content: prompt }] }
        : { model, store: false, input: [{ role: "user", content: prompt }], max_output_tokens: PING_MAX_TOKENS }),
    });
    const ms = now() - started;
    if (!res.ok) {
      const auth = res.status === 401 || res.status === 403;
      return { ...base, sent: true, ms, failure: `sending failed: provider answered HTTP ${res.status}${auth ? " (authentication or permission)" : res.status === 429 ? " (rate or usage limit)" : ""}` };
    }
    const p = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const text = !p ? "" : claude
      ? (Array.isArray(p["content"]) ? (p["content"] as { type?: string; text?: string }[]).filter((x) => x.type === "text").map((x) => x.text ?? "").join(" ") : "")
      : typeof p["output_text"] === "string" ? (p["output_text"] as string)
        : ((p["output"] ?? []) as { type: string; content?: { type: string; text?: string }[] }[]).filter((x) => x.type === "message").flatMap((x) => x.content ?? []).filter((x) => x.type === "output_text").map((x) => x.text ?? "").join(" ");
    const responseId = p && typeof p["id"] === "string" ? (p["id"] as string).slice(0, 80) : null;
    if (!text) return { ...base, sent: true, ms, responseId, failure: "receiving failed: the reply had no readable text" };
    const check = verifyPingReply(text, code, sharedTitle);
    ok = check.code;
    return {
      ...base, sent: true, replied: true, ms, responseId, verified: check.code && check.shared,
      failure: !check.code ? "reply arrived but did not carry the one-time code" : !check.shared ? "reply arrived but did not quote the shared task title" : null,
    };
  } catch {
    const ms = now() - started;
    return { ...base, sent: true, ms, failure: ms >= PING_TIMEOUT_MS - 50 ? `timed out after ${Math.round(PING_TIMEOUT_MS / 1000)} s` : "connection failed before a reply" };
  } finally {
    clearTimeout(timer);
    await deps.settle(reservation.reservationId, ok ? "ok" : "failed").catch(() => undefined);
  }
}
