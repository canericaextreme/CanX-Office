/** Exact read-only commands. Quoted examples and other requests stay in chat. */
export function isCodexStatusCommand(text: string): boolean {
  return /^(?:check (?:the )?(?:builder|codex) connection|(?:use )?check_codex_builds)(?:[.!?]|\s+and tell me (?:the exact connection status or error|the latest build status))?(?:[.!?])?(?:\s+don['’]t start a build[.!]?)?$/i.test(text.trim());
}
