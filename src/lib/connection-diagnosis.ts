/**
 * Rules-only connection diagnosis. No model, no network, no storage.
 * Pasted text is untrusted: it is redacted first and only matched against
 * known failure points. Suggestions never claim a connection works.
 */

export interface DiagnosisFinding {
  id: string;
  title: string;
  likelyCause: string;
  evidence: string;
  nextSteps: string[];
  confidence: "known-cause" | "possible";
}

export interface DiagnosisResult {
  redacted: string;
  redactionCount: number;
  findings: DiagnosisFinding[];
}

export const MAX_DIAGNOSIS_INPUT = 8000;

const REDACTIONS: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token removed]"],
  [/\b(sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,})/g, "[key removed]"],
  [/\b(sk-[A-Za-z0-9_-]{12,})/g, "[key removed]"],
  [/(Bearer\s+)\S+/gi, "$1[token removed]"],
  [/((?:access_token|refresh_token|code|client_secret|password|apikey|api_key)\s*[=:]\s*)["']?[^\s&"',}]+/gi, "$1[removed]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email removed]"],
];

export function redactDiagnostics(input: string): { text: string; count: number } {
  let text = input.slice(0, MAX_DIAGNOSIS_INPUT);
  let count = 0;
  for (const [re, rep] of REDACTIONS) text = text.replace(re, (...m) => { count++; return m[0].replace(re, rep); });
  return { text, count };
}

interface Rule { id: string; test: RegExp; finding: Omit<DiagnosisFinding, "id" | "evidence"> }

const RULES: Rule[] = [
  { id: "isolated-consent-unavailable", test: /isolated office sign-in is unavailable/i, finding: {
    title: "Separate assistant sign-in did not answer",
    likelyCause: "The approval page could not get request details from the assistant sign-in service. A known cause was an unsupported redirect setting on the office's hosting. That fix is prepared in preview and is not published.",
    nextSteps: ["Publish the prepared fix once you have approved it.", "Then reconnect once from ChatGPT or Claude. Don't keep retrying.", "If the same message appears after publishing, report it here again. It points to a different cause."],
    confidence: "known-cause" } },
  { id: "auth-request-failed", test: /CANX_AUTH_REQUEST_FAILED|CANX_CLIENT_AUTHORIZATION_FAILED/, finding: {
    title: "Office sign-in check failed before your approval was read",
    likelyCause: "The sign-in check failed before the office read your approval. Earlier, this came from the same hosting redirect setting.",
    nextSteps: ["Confirm the latest published version includes the redirect repair.", "Reconnect only once after publishing. Approving again won't help until the check itself works."],
    confidence: "known-cause" } },
  { id: "grant-required", test: /current working grant is required|grant (?:was )?not confirmed/i, finding: {
    title: "Record save refused",
    likelyCause: "This message used to cover up the real reason for any save failure. The record may be too large, or the approval may have lapsed.",
    nextSteps: ["Try one smaller note.", "If small notes also fail, check the assistant's room permissions in Systems."],
    confidence: "possible" } },
  { id: "mfa", test: /\baal1\b|authenticator|mfa|step.?up/i, finding: {
    title: "Authenticator step not completed",
    likelyCause: "Approving a connection requires your authenticator code (AAL2). Your ordinary sign-in alone isn't enough.",
    nextSteps: ["Enter your authenticator code on the approval page, then wait for the details to load."],
    confidence: "possible" } },
  { id: "authorization-id", test: /authorization_id|valid authorization request|start this connection from/i, finding: {
    title: "Authorization request missing or expired",
    likelyCause: "The page needs a fresh request started from ChatGPT or Claude. Requests can expire.",
    nextSteps: ["Close the page and start one new reconnect from the assistant."],
    confidence: "possible" } },
  { id: "http-401", test: /\b401\b|unauthori[sz]ed|invalid jwt|jwt expired/i, finding: {
    title: "Sign-in session rejected",
    likelyCause: "The office server didn't accept your sign-in session. It may have expired. Don't assume an API key expired without evidence.",
    nextSteps: ["Sign out and back in to the office, then try once."],
    confidence: "possible" } },
  { id: "http-403", test: /\b403\b|forbidden|access_denied/i, finding: {
    title: "Access refused",
    likelyCause: "The request was refused. It may have been denied, or the account or room permission may not match.",
    nextSteps: ["Check which assistant was selected on the approval page.", "Check the room permissions in Systems. Don't widen them just to make this work."],
    confidence: "possible" } },
  { id: "redirect", test: /redirect|3\d\d\b/i, finding: {
    title: "Redirect involved",
    likelyCause: "The office refuses redirects on purpose. A redirect here usually means a wrong address, or the hosting redirect setting.",
    nextSteps: ["Check that the return address on the approval page belongs to the assistant you started from."],
    confidence: "possible" } },
  { id: "timeout", test: /timeout|timed out|aborted|network ?error|failed to fetch/i, finding: {
    title: "Request didn't finish",
    likelyCause: "The service didn't reply in time. The result is uncertain, so it shouldn't be treated as a refusal or a success.",
    nextSteps: ["Wait a few minutes, then try once. Don't make repeated attempts."],
    confidence: "possible" } },
];

export function diagnoseConnection(input: string): DiagnosisResult {
  const { text, count } = redactDiagnostics(input);
  const findings: DiagnosisFinding[] = [];
  for (const r of RULES) {
    const m = r.test.exec(text);
    if (m) findings.push({ id: r.id, ...r.finding, evidence: m[0].slice(0, 120) });
  }
  return { redacted: text, redactionCount: count, findings };
}
