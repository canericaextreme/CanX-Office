/**
 * Deterministic Office builder selection and direct-build gate.
 * John's current words choose the builder; a model tool call never does.
 * Codex stays the default when John has not named Claude.
 */
import { classifyManagerRisk } from "./manager-work.functions";
import { looksLikeOfficeCodeChange, officeBuildProtectedCategory } from "./codex-task-handoff";
import { isClaudeStatusCommand, isCodexStatusCommand } from "./codex-status-command";

export type OfficeBuilder = "codex" | "claude";
export const BUILDER_LABEL: Record<OfficeBuilder, string> = { codex: "Codex", claude: "Claude" };

export type BuilderChoice = { builder: OfficeBuilder; named: boolean } | { conflict: true };

/** Builder John named in his own request. Both named = ask, never guess. */
export function builderChoiceFor(request: string): BuilderChoice {
  const claude = /\bclaude\b/i.test(request);
  const codex = /\bcodex\b/i.test(request);
  if (claude && codex) return { conflict: true };
  if (claude) return { builder: "claude", named: true };
  if (codex) return { builder: "codex", named: true };
  return { builder: "codex", named: false };
}

const DISCUSSION = /\b(for example|e\.g\.|example|hypothetical(?:ly)?|what if|suppose|imagine|would it|should (?:i|we)|don['’]?t (?:build|start|send)|do not (?:build|start|send)|not yet|just asking|explain)\b/i;
const BUILD_INTENT = /\b(build|implement|code|fix|send (?:it |this |the task )?to (?:claude|codex|the builder))\b/i;

/**
 * Server-side check of the ACTUAL current owner request before a direct
 * start_<builder>_build call dispatches. Returns a refusal reason or null.
 */
export function directBuildRefusal(request: string, builder: OfficeBuilder): string | null {
  const text = request.trim();
  const choice = builderChoiceFor(text);
  if ("conflict" in choice) return "Your request names both Claude and Codex. Say which one builder should do it; nothing was sent.";
  if (choice.builder !== builder) return `Your request chose ${BUILDER_LABEL[choice.builder]}, so nothing was sent to ${BUILDER_LABEL[builder]}.`;
  if (isCodexStatusCommand(text) || isClaudeStatusCommand(text) || /\?\s*$/.test(text)) return "That was a status question, so no build was started.";
  if (DISCUSSION.test(text)) return "That reads as discussion or an example, so no build was started.";
  if (!(looksLikeOfficeCodeChange(text) || BUILD_INTENT.test(text))) return "No explicit Office code change was requested, so no build was started.";
  if (classifyManagerRisk(`start_${builder}_build`, text) !== "green") return "This request is not green-light work, so no build was started.";
  const protectedCategory = officeBuildProtectedCategory(text);
  if (protectedCategory) return `This request includes a protected action (${protectedCategory}), so no build was started.`;
  return null;
}
