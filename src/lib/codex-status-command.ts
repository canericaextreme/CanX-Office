/** Exact read-only commands. Quoted examples and other requests stay in chat. */
export function isCodexStatusCommand(text: string): boolean {
  return /^(?:please )?(?:check (?:the )?(?:builder|codex)(?: (?:build|builder))? connection|check (?:the )?(?:codex|builder) (?:builds?(?: status)?|status)|(?:use )?check_codex_builds)(?:[.!?]|\s+and tell me (?:the exact connection status or error|the latest build status))?(?:[.!?])?(?:\s+(?:don['’]t|do not) start a build[.!]?)?$/i.test(text.trim());
}
/** Exact read-only Claude builder status commands. Never start a build. */
export function isClaudeStatusCommand(text: string): boolean {
  return /^(?:please )?(?:check (?:the )?claude (?:builds?(?: status)?|builder(?: connection)?|build connection|connection|status)|(?:use )?check_claude_builds)(?:[.!?]|\s+and tell me (?:the exact connection status or error|the latest build status))?(?:[.!?])?(?:\s+(?:don['’]t|do not) start a build[.!]?)?$/i.test(text.trim());
}
