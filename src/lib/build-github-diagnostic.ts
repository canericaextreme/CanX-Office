/** Safe, owner-visible diagnostics. Never return exception text, headers or bodies. */
export interface BuildGitHubTrace {
  operation: 'workflow list' | 'run read' | 'change read' | 'change files' | 'change lookup' | 'build dispatch';
  stage: 'request' | 'response JSON' | 'response processing';
  method: 'GET' | 'POST';
}
export const newBuildGitHubTrace = (): BuildGitHubTrace => ({ operation: 'workflow list', stage: 'request', method: 'GET' });
export function traceBuildGitHubRequest(trace: BuildGitHubTrace, path: string, init: RequestInit) {
  trace.operation = path.includes('/dispatches') ? 'build dispatch'
    : path.includes('/actions/workflows/') ? 'workflow list'
    : path.includes('/actions/runs/') ? 'run read'
    : path.includes('/files?') ? 'change files'
    : path.includes('/pulls?') ? 'change lookup' : 'change read';
  trace.stage = 'request';
  trace.method = init.method === 'POST' ? 'POST' : 'GET';
}
export async function readBuildGitHubJson(response: Response, trace: BuildGitHubTrace) {
  trace.stage = 'response JSON';
  const body = await response.json();
  trace.stage = 'response processing';
  return body;
}
const safeCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
function safeCauseCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth++) {
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === 'string' && safeCodes.has(item.code)) return item.code;
    current = item.cause;
  }
  return undefined;
}
export function buildGitHubFailure(error: unknown, trace: BuildGitHubTrace): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  const cause = safeCauseCode(error);
  const [code, explanation] = /header|bytestring|character/i.test(message)
    ? ['GH_HEADER_INVALID', 'The saved GitHub token could not be used as an HTTP header.']
    : name === 'TimeoutError' || name === 'AbortError'
      ? ['GH_TIMEOUT', 'The GitHub request timed out or was interrupted.']
      : trace.stage === 'response JSON' && name === 'SyntaxError'
        ? ['GH_JSON_INVALID', 'The GitHub response could not be read as JSON.']
        : trace.stage === 'request'
          ? [/redirect/i.test(message) ? 'GH_REDIRECT_REJECTED' : cause ? 'GH_NETWORK' : 'GH_REQUEST_FAILED', 'The Office could not complete its request to GitHub.']
          : ['GH_RESPONSE_FAILED', 'The Office could not process the GitHub response.'];
  return `${explanation} Diagnostic ${code}; ${trace.operation}; ${trace.stage}; ${trace.method}${cause ? `; cause ${cause}` : ''}.`;
}
export function buildGitHubHttpFailure(response: Response, trace: BuildGitHubTrace): string {
  // Only a standard numeric status and fixed labels. Never read the error body.
  const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : 'UNKNOWN';
  const redirect = typeof status === 'number' && status >= 300 && status <= 399
    ? ' GitHub returned a redirect; the Office did not follow it or forward credentials.' : '';
  return ` Diagnostic GH_HTTP_${status}; ${trace.operation}; ${trace.method}.${redirect}`;
}
