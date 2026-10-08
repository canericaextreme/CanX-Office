/**
 * Deterministic Office builder selection and direct-build gate.
 * Explicit owner builder choices take precedence. Otherwise the assistant may
 * choose one builder; Codex remains the backwards-compatible default.
 */
import { classifyManagerRisk } from "./manager-work.functions";
import { officeBuildProtectedCategory } from "./codex-task-handoff";
import { isClaudeStatusCommand, isCodexStatusCommand } from "./codex-status-command";

export type OfficeBuilder = "codex" | "claude";
export const BUILDER_LABEL: Record<OfficeBuilder, string> = { codex: "Codex", claude: "Claude" };

export type BuilderChoice = { builder: OfficeBuilder; named: boolean } | { conflict: true };

/** Builder John named in his own request. Both named = ask, never guess. */
export function builderChoiceFor(request: string, preferred: OfficeBuilder = "codex"): BuilderChoice {
  const claude = /\bclaude\b/i.test(request);
  const codex = /\bcodex\b/i.test(request);
  if (claude && codex) return { conflict: true };
  if (claude) return { builder: "claude", named: true };
  if (codex) return { builder: "codex", named: true };
  return { builder: preferred, named: false };
}

const DISCUSSION = /\b(for example|e\.g\.|example|hypothetical(?:ly)?|what if|suppose|imagine|how (?:would|could|to)|would (?:it|you|claude|codex)|could (?:claude|codex)|should (?:i|we)|read[ -]?only|no changes|no builds|don['’]?t (?:build|start|send|submit|execute|run|act|create|save|make changes)|do not (?:build|start|send|submit|execute|run|act|create|save|make changes)|not yet|just (?:asking|checking|discussing|planning)|explain)\b/i;
// A noun such as "build" or "fix" in a status report is never permission.
// Accept commands (including polite "Can you fix …?"), not arbitrary mentions.
const COMMAND_PREFIX = String.raw`^(?:(?:okay|ok|[’\']?kay)[,.]?\s+)?(?:please\s+)?(?:(?:let[’\']s|let us)(?:\s+go)?\s+)?(?:(?:claude|codex|elsie)[,:]?\s+)?(?:(?:can|could|would) you\s+)?`;
const CHANGE = String.raw`(?:build|implement|code|fix|create|write|add|remove|hide|change|move|rename|replace|resize|recolou?r|make|put|update)`;
const BUILD_INTENT = new RegExp(`${COMMAND_PREFIX}${CHANGE}\\b|^(?:please\\s+)?(?:have|ask) (?:claude|codex|elsie) (?:to )?${CHANGE}\\b`, "i");
const TASK_INTENT = new RegExp(`${COMMAND_PREFIX}(?:execute|carry out|run|start|do|begin) (?:the |this |my )?(?:saved |existing )?(?:task|job|work|assignment)\\b|${COMMAND_PREFIX}(?:send|submit) (?:the |this |my )?(?:saved |existing )?(?:task|job) to (?:claude|codex|the builder)\\b`, "i");

export const requestIsDiscussionOnly = (request: string): boolean => DISCUSSION.test(request);

/** Current owner intent is checked on every build entry point, not model scope. */
export function taskExecutionRefusal(request: string): string | null {
  if (DISCUSSION.test(request)) return "That reads as discussion or a read-only request, so no task was executed.";
  return TASK_INTENT.test(request.trim()) ? null : "No explicit request to execute a saved task was received; nothing was sent.";
}

/**
 * Server-side check of the ACTUAL current owner request before a direct
 * start_<builder>_build call dispatches. Returns a refusal reason or null.
 */
export function directBuildRefusal(request: string, builder: OfficeBuilder): string | null {
  const text = request.trim();
  const choice = builderChoiceFor(text, builder);
  if ("conflict" in choice) return "Your request names both Claude and Codex. Say which one builder should do it; nothing was sent.";
  if (choice.builder !== builder) return `Your request chose ${BUILDER_LABEL[choice.builder]}, so nothing was sent to ${BUILDER_LABEL[builder]}.`;
  if (isCodexStatusCommand(text) || isClaudeStatusCommand(text) || (/\?\s*$/.test(text) && !BUILD_INTENT.test(text))) return "That was a status question, so no build was started.";
  if (DISCUSSION.test(text)) return "That reads as discussion or an example, so no build was started.";
  if (!BUILD_INTENT.test(text)) return "No explicit Office code change was requested, so no build was started.";
  if (classifyManagerRisk(`start_${builder}_build`, text) !== "green") return "This request is not green-light work, so no build was started.";
  const protectedCategory = officeBuildProtectedCategory(text);
  if (protectedCategory) return `This request includes a protected action (${protectedCategory}), so no build was started.`;
  return null;
}
