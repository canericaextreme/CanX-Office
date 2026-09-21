/** Classify provider failures without rendering raw upstream messages or secrets. */
export function voiceProviderFailure(status: number, body: unknown, retryAfter: string | null = null) {
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
  return `The live voice service could not connect (HTTP ${status}). Please try again.`;
}
