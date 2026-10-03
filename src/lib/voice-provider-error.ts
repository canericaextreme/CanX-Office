/** Classify provider failures without rendering raw upstream messages or secrets. */
export type VoiceFailureStage = "session setup" | "voice handshake";

const SAFE_TOKEN = /^[A-Za-z0-9_.\[\]-]{1,80}$/;
/** Only short identifier-shaped code/type/param values survive; messages never do. */
export function safeProviderErrorFields(body: unknown): { code?: string; type?: string; param?: string } {
  const raw = body && typeof body === "object" ? (body as {error?: unknown}).error : null;
  if (!raw || typeof raw !== "object") return {};
  const out: { code?: string; type?: string; param?: string } = {};
  for (const key of ["code", "type", "param"] as const) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && SAFE_TOKEN.test(v) && !/^(sk|ek|rk)[-_]/i.test(v)) out[key] = v;
  }
  return out;
}

export function voiceProviderFailure(status: number, body: unknown, retryAfter: string | null = null, stage?: VoiceFailureStage) {
  const raw = body && typeof body === "object" ? (body as {error?: unknown}).error : null;
  const error = raw && typeof raw === "object" ? raw as {code?: unknown; type?: unknown} : {};
  const codes = [error.code, error.type];
  const quota = codes.some(code => code === "insufficient_quota" || code === "billing_hard_limit_reached" || code === "billing_not_active");
  if (quota) return "OpenAI reports that API credit or its billing allowance is unavailable. The office approval button cannot add provider credit. Check the OpenAI API billing account.";
  if (status === 429) {
    const seconds = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter) ? Math.ceil(Number(retryAfter)) : null;
    if (codes.includes("rate_limit_exceeded")) {
      return `OpenAI reports a voice rate limit.${seconds && seconds <= 86400 ? ` Wait at least ${seconds} seconds before trying again.` : " Wait before trying again; if it continues, check the project's voice model limits."} The microphone permission is not the cause.`;
    }
    return "OpenAI rejected the voice connection (HTTP 429), but did not identify whether this is credit, request rate or session capacity. Check the OpenAI API account limits. Repeatedly pressing Start will not fix a provider limit.";
  }
  if (status === 401 || status === 403) return "The live voice service rejected the session. Press Start conversation for a fresh connection.";
  if (stage) {
    const f = safeProviderErrorFields(body);
    const bits = [f.code && `code ${f.code}`, f.type && `type ${f.type}`, f.param && `field ${f.param}`].filter(Boolean);
    const reason = bits.length ? ` OpenAI reported ${bits.join(", ")}.` : " OpenAI gave no identifiable reason.";
    const advice = status === 400 ? " This is a request the provider refused, so retrying unchanged will not help." : " Please try again.";
    return `The live voice service refused the ${stage} step (HTTP ${status}).${reason}${advice}`;
  }
  return `The live voice service could not connect (HTTP ${status}). Please try again.`;
}
