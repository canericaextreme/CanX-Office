/**
 * Deterministic Office builder selection and direct-build gate.
 * John's current words choose the builder; a model tool call never does.
 * Codex stays the default when John has not named Claude.
 */
import { classifyManagerRisk } from "./manager-work.functions";
import { officeBuildProtectedCategory, CHANGE_WORDS } from "./codex-task-handoff";
import { isClaudeStatusCommand, isCodexStatusCommand } from "./codex-status-command";

export type OfficeBuilder = "codex" | "claude";
export const BUILDER_LABEL: Record<OfficeBuilder, string> = { codex: "Codex", claude: "Claude" };

export type BuilderChoice = { builder: OfficeBuilder; named: boolean } | { conflict: true };

/** "Codex only" / "only Claude" marks the one builder; the other name may then appear as a reviewer. */
const exclusive = (name: string) => new RegExp(String.raw`\b${name}[ -]only\b|\bonly (?:use )?${name}\b`, "i");

/** Builder John named in his own request. Both named = ask, never guess,
 * unless exactly one is marked "only" (e.g. "Codex only … Claude may review").
 */
export function builderChoiceFor(request: string): BuilderChoice {
  // "the Claude button", "ChatGPT and the Claude tabs" name a thing on the screen, not the builder.
  const builderWords = request
    .replace(/\b(?:ChatGPT and (?:the )?Claude|Claude and (?:the )?ChatGPT)\b/gi, "colleague")
    .replace(/\b(?:the |a |that |this )?claude (?:buttons?|tabs?|links?|access|cards?|reviews?|panels?|icons?|chat|connection)\b/gi, "colleague control");
  const claude = /\bclaude\b/i.test(builderWords);
  const codex = /\bcodex\b/i.test(request);
  if (claude && codex) {
    const claudeOnly = exclusive("claude").test(request);
    const codexOnly = exclusive("codex").test(request);
    if (claudeOnly !== codexOnly) return { builder: claudeOnly ? "claude" : "codex", named: true };
    return { conflict: true };
  }
  if (claude) return { builder: "claude", named: true };
  if (codex) return { builder: "codex", named: true };
  return { builder: "codex", named: false };
}

const DISCUSSION = /\b(for example|e\.g\.|example|hypothetical(?:ly)?|what if|suppose|imagine|how (?:would|could|to)|would (?:it|you|claude|codex)|could (?:claude|codex)|should (?:i|we)|read[ -]?only|no changes|no builds|don['’]?t (?:build|start|send|submit|execute|run|act|create|save|make changes)|do not (?:build|start|send|submit|execute|run|act|create|save|make changes)|not yet|just (?:asking|checking|discussing|planning)|explain)\b/i;
// A noun such as "build" or "fix" in a status report is never permission.
// Accept commands (including polite "Can you fix …?"), not arbitrary mentions.
// 21 Oct: spoken requests ("Claude has to fix …", "You need to pass the task …",
// "I want you to add …", "Go ahead and fix …") count like the bare command.
const COMMAND_PREFIX = String.raw`^(?:please\s+)?(?:(?:only\s+)?(?:claude|codex|elsie)(?:[ -]only)?[,:]?\s+)?(?:(?:can|could|would) you\s+)?(?:(?:you|we)\s+)?(?:(?:(?:need|needs|have|has|got) to|gotta|must)\s+)?(?:i (?:want|need|would like|['’]d like) (?:you|claude|codex|elsie) to\s+)?(?:go ahead and\s+|let['’]?s\s+)?(?:please\s+)?`;
const CHANGE = String.raw`(?:${CHANGE_WORDS})`;
const BUILD_INTENT = new RegExp(`${COMMAND_PREFIX}${CHANGE}\\b|^(?:please\\s+)?(?:have|ask) (?:claude|codex|elsie) (?:to )?${CHANGE}\\b`, "i");
// Explicit builder dispatch wording: "Start a new Codex build to repair ...".
const DIRECT_START = /^(?:please\s+)?(?:(?:elsie|chatgpt)[,:]?\s+)?(?:start|launch|submit|run|kick off)\s+(?:a |the )?(?:new |fresh )?(?:(?:codex|claude)\s+)?build\s+to\s+(?:build|implement|fix|repair|change|update|add|remove)\b/i;
// Voice transcripts and Office chat can prepend conversational lead-ins; the
// explicit start-build clause remains owner-authored and still passes all gates.
const DIRECT_START_CLAUSE = /\b(?:start|launch|submit|run|kick off)\s+(?:a |the )?(?:new |fresh )?(?:(?:codex|claude)\s+)?build\s+to\s+(?:build|implement|fix|repair|change|update|add|remove)\b/i;
export const isDirectBuildCommand = (request: string): boolean =>
  sentences(request).some(part => DIRECT_START.test(part) ||
    (/^(?:(?:okay|ok|yeah|yes|right|well|so)[,.!]?\s+)*.{0,100}?(?:elsie|chatgpt)[,:]\s+/i.test(part) && DIRECT_START_CLAUSE.test(part)));
const TASK_INTENT = new RegExp(`${COMMAND_PREFIX}(?:execute|carry out|run|start|do|begin|pass|kick off) (?:the |this |my |that |whatever )?(?:saved |existing |waiting )?(?:task|job|work|assignment)\\b|${COMMAND_PREFIX}(?:send|submit) (?:the |this |my )?(?:saved |existing )?(?:task|job) to (?:claude|codex|the builder)\\b`, "i");
// Spoken "do it" after a task was just saved: "Put that into work", "Go ahead", "Proceed with it".
const FOLLOW_UP = new RegExp(String.raw`${COMMAND_PREFIX}(?:(?:do|start|finish|build|implement|fix) (?:it|that|this|them)(?: now)?|go ahead|proceed|carry on|get (?:it|that|this) done|get (?:on|started on|going on) (?:it|that|this)|make (?:it|that) happen|put (?:it|that|this|them) (?:into|in|to) (?:work|action|motion|the build(?:er)?)|send (?:it|that|this) (?:through|off|over|to (?:the )?build(?:er)?)|implement the change)\b`, "i");
// "Proceed with moving the Claude tab", "go ahead with the fix".
const PROCEED_WITH = /^(?:please\s+)?(?:proceed|go ahead|carry on|get started)\s+(?:with|on)\s+(?:the |this |that )?(?:\w+ing|change|fix|task|job|work|build)\b/i;

// What John wants the screen to do, said as a wish: "I want the button to say …",
// "It should only say Work with Claude". Wishes to know or see status are not changes.
const DESIRE = new RegExp(String.raw`^(?:i (?:want|need|would like|['’]d like)|we need) (?:the|it|this|that|them|my|our|its|every|each|all|elsie['’]s)\b(?!.*\b(?:status|summary|report|news|overview|progress|update on)\b)|^(?:it|the [\w'’ -]{1,40}?) (?:should|needs to|has to|must) (?:only |just )?(?:say|read|show|open|look|match|display|sit|go|be)\b|^(?:they|it|these|those|both(?: of them)?|the [\w'’ -]{1,40}?) (?:need|needs|has|have) to be (?:\w+ed|\w+en|apart|separate|side by side|bigger|smaller|wider|narrower|higher|lower|shorter|taller|closer|further apart)\b|^(?:they|it|these|those|both(?: of them)?|the [\w'’ -]{1,40}?) (?:should|must) be (?:\w+ed|apart|separate|side by side|bigger|smaller|wider|narrower|higher|lower|closer|further apart)\b`, "i");
// Spoken openers before the real instruction: "Okay,", "Yeah,", "No, it's not done."
const OPENER = /^(?:(?:ok(?:ay)?|yeah|yes|yep|no|nope|so|alright|all right|right|well|um+|uh+|hey|and|but|now|then|also|just)\b[,.!]?\s+)+/i;
const sentences = (text: string): string[] =>
  text.trim().split(/(?<=[.!?;])\s+/).map(part => part.replace(OPENER, "").trim()).filter(Boolean);
// Spoken requests often put the order after a comma: "the buttons are overlapped, just separate them".
const clauses = (text: string): string[] =>
  sentences(text).flatMap(part => [part, ...part.split(/,\s+/).slice(1).map(c => c.replace(OPENER, "").trim())]).filter(Boolean);
/** Any sentence of John's request is a direct change instruction or a clear wish for one. */
const hasBuildIntent = (text: string): boolean => clauses(text).some(part => BUILD_INTENT.test(part) || DESIRE.test(part) || PROCEED_WITH.test(part));
/** Carrying out a saved task: a run/pass command, a spoken "do it", or John saying the change itself again. */
const hasTaskIntent = (text: string): boolean => hasBuildIntent(text) || clauses(text).some(part => TASK_INTENT.test(part) || FOLLOW_UP.test(part));

const EXPLICIT_HANDOFF = /^(?:please\s+)?(?:elsie[,:]?\s+)?(?:pass|send|hand off|hand over|assign|queue)\s+(?:this |the |my )?(?:task|job|assignment|request)?\s*(?:to\s+claude\b|to\s+codex\b|for\s+claude\b|for\s+codex\b)/i;
const HANDOFF_PREFIX = /^(?:please\s+)?(?:elsie[,:]?\s+)?(?:pass|send|hand off|hand over|assign|queue)\s+(?:it |this |the |my )?(?:task |job |assignment |request )?(?:to|for)\s+(?:the\s+)?(?:builder|claude|codex)(?:\s+(?:next|after (?:the|its) current (?:build|job|task)))?\s*[:,\-–—]\s*/i;

/** The owner's scope after an explicit "pass this task to Claude:" routing prefix.
 * The prefix only names our internal builder; every other word is still checked.
 */
export const stripBuilderHandoffPrefix = (request: string): string => request.trim().replace(HANDOFF_PREFIX, "");

/** John asked to queue the work behind the builder's current job rather than start now. */
export const requestAsksToQueue = (request: string): boolean =>
  /^(?:please\s+)?(?:elsie[,:]?\s+)?queue\b/i.test(request.trim()) || /\b(?:after (?:the|its|his|her) current (?:build|job|task)|when (?:claude|codex) (?:is )?(?:free|finishe?s|done)|next in (?:line|the queue))\b/i.test(request);

/** Treat clear handoffs as actions, without overriding explicit stop conditions. */
export const requestIsDiscussionOnly = (request: string): boolean => {
  const text = request.trim();
  const explicitStop = /\b(?:do not|don't|don’t|no)\s+(?:build|start|send|submit|execute|run|act|create|save|make changes)\b|\b(?:not yet|read[ -]?only|hypothetical(?:ly)?|for example|just (?:asking|checking|discussing|planning))\b|\bput (?:it |that |this |them |everything |the [\w'’ -]{1,30}?)?on (?:pause|hold)\b|\b(?:hold off|pause (?:it|that|this))\b|^(?:okay,?\s+)?stop\b/i;
  if (explicitStop.test(text)) return true;
  if (EXPLICIT_HANDOFF.test(text)) return false;
  return DISCUSSION.test(text);
};

/** Current owner intent is checked on every build entry point, not model scope. */
export function taskExecutionRefusal(request: string): string | null {
  if (requestIsDiscussionOnly(request)) return "That reads as discussion or a read-only request, so no task was executed.";
  return (hasTaskIntent(request) || (EXPLICIT_HANDOFF.test(request.trim()) && /\b(?:task|job|assignment)\b/i.test(request))) ? null : "I didn't hear a change to make in that, so I didn't send anything to the builder. Tell me the change, like \"move the Claude button down a bit\", or say \"do it\" for the job I just saved.";
}

/**
 * Server-side check of the ACTUAL current owner request before a direct
 * start_<builder>_build call dispatches. Returns a refusal reason or null.
 */
export function directBuildRefusal(request: string, builder: OfficeBuilder): string | null {
  // A quoted owner instruction after this explicit handoff prefix is still
  // the owner's scope. Keep the original request for builder/risk selection.
  const text = stripBuilderHandoffPrefix(request.trim().replace(/^(?:please\s+)?pass this to (?:the )?(?:builder|codex|claude):\s*/i, ""));
  const choice = builderChoiceFor(request);
  if ("conflict" in choice) return "Your request names both Claude and Codex. Say which one builder should do it; nothing was sent.";
  if (choice.builder !== builder) return `Your request chose ${BUILDER_LABEL[choice.builder]}, so nothing was sent to ${BUILDER_LABEL[builder]}.`;
  if (isCodexStatusCommand(text) || isClaudeStatusCommand(text) || (/\?\s*$/.test(text) && !hasBuildIntent(text))) return "That was a status question, so no build was started.";
  if (requestIsDiscussionOnly(request)) return "That reads as discussion or an example, so no build was started.";
  if (!hasBuildIntent(text) && !isDirectBuildCommand(text)) return "I couldn't tell what to change on the screen, so I didn't start a build. Tell me the change, like \"move the Claude button down a bit\".";
  if (classifyManagerRisk(`start_${builder}_build`, request) !== "green") return "This request is not green-light work, so no build was started.";
  const protectedCategory = officeBuildProtectedCategory(stripBuilderHandoffPrefix(request));
  if (protectedCategory) return `This request includes a protected action (${protectedCategory}), so no build was started.`;
  return null;
}
