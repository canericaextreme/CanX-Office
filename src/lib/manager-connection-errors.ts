/** Static diagnostics only: never return an upstream message, URL or credential. */
export function managerConnectionFailure(error: unknown, timedOut: boolean): string {
  const base = "The AI connection check did not complete, so the manager stays disconnected.";
  if (timedOut) return `${base} The server timed out after 15 seconds before receiving a provider response.`;
  if (!(error instanceof Error)) return `${base} No provider response was received (unknown transport failure).`;
  const cause = error.cause;
  const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  const knownCodes = new Set([
    "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
    "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID",
  ]);
  if (typeof code === "string" && knownCodes.has(code)) {
    return `${base} The server's provider network request failed (${code}); no HTTP response was received.`;
  }
  // Match known runtime wording, but never echo the actual thrown text.
  if (/illegal invocation|invalid receiver/i.test(error.message)) {
    return `${base} The server runtime rejected the provider fetch invocation before sending the request.`;
  }
  if (/invalid character.*header|header.*invalid character/i.test(error.message)) {
    return `${base} The server rejected an invalid request-header value before sending the provider request.`;
  }
  if (/network connection lost|fetch failed/i.test(error.message)) {
    return `${base} The server could not complete its provider network request; no HTTP response was received.`;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return `${base} The provider request was interrupted before an HTTP response was received.`;
  }
  if (error.name === "TypeError" || error.name === "NetworkError") {
    return `${base} The provider request failed at the transport layer before an HTTP response was received.`;
  }
  return `${base} No provider response was received (unknown transport failure).`;
}
