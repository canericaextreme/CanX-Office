/**
 * Deterministic Office builder selection and direct-build gate.
 * John's current words choose the builder; a model tool call never does.
 * Codex stays the default when John has not named Claude.
 */
import { classifyManagerRisk } from "./manager-work.functions";
import { officeBuildProtectedCategory } from "./codex-task-handoff";
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
  const builderWords = request.replace(/\b(?:ChatGPT and Claude|Claude and ChatGPT) (?:buttons|tabs|links)\b/gi, "colleague controls");
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

const DISCUSSION = /\b(for example|e\.g\.|example|hypothetical(?:ly)?|what if|suppose|imagine|how (?:would|could|to)|would (?:it|you|claude|codex)|could (?:claude|codex)|should (?:i|we)|read[ -]?only|no changes|no builds|don['’]?t (?:prepare|draft|put together|work on|broaden|pass|assign|queue|hand off|build|start|send|submit|execute|run|act|create|save|make changes)|do not (?:prepare|draft|put together|work on|broaden|pass|assign|queue|hand off|build|start|send|submit|execute|run|act|create|save|make changes)|not yet|just (?:asking|checking|discussing|planning)|explain)\b/i;
// A noun such as "build" or "fix" in a status report is never permission.
// Accept commands (including polite "Can you fix …?"), not arbitrary mentions.
// 21 Oct: spoken requests ("Claude has to fix …", "You need to pass the task …",
// "I want you to add …", "Go ahead and fix …") count like the bare command.
const COMMAND_PREFIX = String.raw`^(?:please\s+)?(?:(?:only\s+)?(?:claude|codex|elsie)(?:[ -]only)?[,:]?\s+)?(?:(?:can|could|would) you\s+)?(?:(?:you|we)\s+)?(?:(?:(?:need|needs|have|has|got) to|gotta|must)\s+)?(?:i (?:want|need|would like|['’]d like) (?:you|claude|codex|elsie) to\s+)?(?:go ahead and\s+|let['’]?s\s+)?(?:please\s+)?`;
const CHANGE = String.raw`(?:prepare|draft|put together|work on|broaden|separate|space|build|implement|code|fix|repair|apply|create|write|add|remove|hide|change|move|rename|replace|resize|recolou?r|make|put|update|organi[sz]e|reorgani[sz]e|arrange|rearrange|redesign|restyle|tidy)`;
const BUILD_INTENT = new RegExp(`${COMMAND_PREFIX}${CHANGE}\\b|^(?:please\\s+)?(?:have|ask) (?:claude|codex|elsie) (?:to )?${CHANGE}\\b`, "i");
// Explicit builder dispatch wording: "Start a new Codex build to repair ...".
const DIRECT_START = new RegExp(`${COMMAND_PREFIX}(?:start|launch|submit|run|kick off)\\s+(?:a |the )?(?:new |fresh )?(?:(?:codex|claude)\\s+)?build\\s+to\\s+(?:build|implement|fix|repair|change|update|add|remove)\\b`, 'i');
export const isDirectBuildCommand = (request: string): boolean =>
  sentences(request).some(part => DIRECT_START.test(part));
const TASK_INTENT = new RegExp(`${COMMAND_PREFIX}(?:prepare|draft|put together|work on|broaden|execute|carry out|run|start|do|begin|pass|kick off) (?:the |this |my |that |whatever )?(?:saved |existing |waiting )?(?:task|job|work|assignment)\\b|${COMMAND_PREFIX}(?:send|submit) (?:the |this |my )?(?:saved |existing )?(?:task|job) to (?:elsie|claude|codex|the builder)\\b`, "i");
// Resume wording is permission to address an exact saved task, not permission
// to invent its scope or start another attempt. The executor still reads its
// status, existing receipt, owner, risk and protected scope before dispatch.
const FOLLOWUP_TASK_INTENT = new RegExp(`${COMMAND_PREFIX}(?:(?:finish|complete|continue|resume)(?: working on| work on)?|carry on(?: with)?|keep (?:working|going)(?: on| with)?)\\s+(?:the |this |that |my |our )?(?:saved |existing |current |waiting |unfinished )?(?:task|job|assignment|fix|repair|loop(?: test)?)\\b|${COMMAND_PREFIX}get\\s+(?:the |this |that )?(?:task|job|fix|repair|loop test)\\s+(?:done|finished|completed)\\b`, 'i');

// What John wants the screen to do, said as a wish: "I want the button to say …",
// "It should only say Work with Claude". Wishes to know or see status are not changes.
const DESIRE = new RegExp(String.raw`^(?:i (?:want|need|would like|['’]d like)|we need) (?:the|it|this|that|my|our|its|every|each|all|elsie['’]s)\b(?!.*\b(?:status|summary|report|news|overview|progress|update on)\b)|^(?:it|the [\w'’ -]{1,40}?) (?:should|needs to|has to|must) (?:only |just )?(?:say|read|show|open|look|match|display)\b`, "i");
// Spoken openers before the real instruction: "Okay,", "Yeah,", "No, it's not done."
const OPENER = /^(?:(?:ok(?:ay)?|yeah|yes|yep|no|nope|so|alright|all right|right|well|um+|uh+|hey|and|but|now|then|also|just)\b[,.!]?\s+)+/i;
const sentences = (text: string): string[] =>
  text.trim().split(/(?<=[.!?;])\s+/).map(part => part.replace(OPENER, "").trim()).filter(Boolean);
/** Any sentence of John's request is a direct change instruction or a clear wish for one. */
const hasBuildIntent = (text: string): boolean => sentences(text).some(part => BUILD_INTENT.test(part) || DESIRE.test(part));
const hasTaskIntent = (text: string): boolean => sentences(text).some(part => TASK_INTENT.test(part) || FOLLOWUP_TASK_INTENT.test(part));

const EXPLICIT_HANDOFF = /^(?:please\s+)?(?:elsie[,:]?\s+)?(?:pass|send|hand off|hand over|assign|queue)\s+(?:this |the |my )?(?:task|job|assignment|request)?\s*(?:to\s+(?:elsie|claude|codex)\b|for\s+(?:elsie|claude|codex)\b)/i;
const HANDOFF_PREFIX = /^(?:please\s+)?(?:elsie[,:]?\s+)?(?:pass|send|hand off|hand over|assign|queue)\s+(?:it |this |the |my )?(?:task |job |assignment |request )?(?:to|for)\s+(?:the\s+)?(?:builder|elsie|claude|codex)(?:\s+(?:next|after (?:the|its) current (?:build|job|task)))?\s*[:,\-–—]\s*/i;

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
  const explicitStop = /\b(?:do not|don't|don’t|never|must not|no)\s+(?:prepare|draft|put together|work on|broaden|pass|assign|queue|hand off|build|start|send|submit|execute|run|act|create|save|make changes)\b|\b(?:not yet|read[ -]?only|hypothetical(?:ly)?|for example|just (?:asking|checking|discussing|planning))\b|\bput (?:it |that |this |them |everything |the [\w'’ -]{1,30}?)?on (?:pause|hold)\b|\b(?:hold off|pause (?:it|that|this))\b|^(?:okay,?\s+)?(?:stop|wait|pause)\b/i;
  if (explicitStop.test(text) || /^no[,:]\s*(?:please\s+)?(?:prepare|draft|put together|work on|broaden|pass|send|assign|queue)\b/i.test(text)) return true;
  if (EXPLICIT_HANDOFF.test(text) && !/\b(?:what if|suppose|imagine|how (?:would|could|to)|should (?:we|I)|just discuss(?:ing)?|discuss whether)\b/i.test(text)) return false;
  return DISCUSSION.test(text);
};

/** Intake advice only. Never grants permission or replaces action-specific guards.
 * Estimates describe a draft; coordinated transaction/plan-change verbs still
 * require John's decision. Keep the original wording and task IDs untouched.
 */
export function taskIntakeKind(request: string): "discussion" | "owner-decision" | "preparation" | "handoff" | "other" {
  if (requestIsDiscussionOnly(request)) return "discussion";
  const scope = stripBuilderHandoffPrefix(request);
  // Examine imperative clauses, not a protected noun inside a proposal title.
  const clauses = sentences(scope).flatMap(part => part.split(/\s+(?:and(?: then)?|then|but|also)\s+|,\s*/i));
  const decision = clauses.some(part => {
    const command = part.trim().replace(OPENER, "").replace(new RegExp(COMMAND_PREFIX, "i"), "");
    return /^(?:buy|purchase|subscribe|pay|spend|charge|upgrade|downgrade|cancel|switch)\b|^change\b.*\b(?:subscription|billing|paid|service plan)\b/i.test(command);
  });
  if (decision) return "owner-decision";
  if (hasBuildIntent(scope) && /\b(?:proposal|draft|campaign|cost estimates?|options|recommendations?)\b/i.test(scope)
    && new RegExp(`${COMMAND_PREFIX}(?:prepare|draft|put together|work on|broaden)\\b`, "i").test(scope)) return "preparation";
  if (EXPLICIT_HANDOFF.test(request.trim())) return "handoff";
  return "other";
}

/** Current owner intent is checked on every build entry point, not model scope. */
export function taskExecutionRefusal(request: string): string | null {
  if (requestIsDiscussionOnly(request)) return "That reads as discussion or a read-only request, so no task was executed.";
  return (hasTaskIntent(request) || (EXPLICIT_HANDOFF.test(request.trim()) && /\b(?:task|job|assignment)\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(request))) ? null : "No explicit request to execute a saved task was received; nothing was sent.";
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
  if (isCodexStatusCommand(text) || isClaudeStatusCommand(text) || (/\?\s*$/.test(text) && !hasBuildIntent(text) && !isDirectBuildCommand(text))) return "That was a status question, so no build was started.";
  if (requestIsDiscussionOnly(request)) return "That reads as discussion or an example, so no build was started.";
  if (taskIntakeKind(request) === "owner-decision") return "This request requires the existing owner decision check; no build was started.";
  if (taskIntakeKind(request) === "preparation") return "This is preparation for Elsie, not an Office code build; use the existing task intake.";
  if (!hasBuildIntent(text) && !isDirectBuildCommand(text)) return "No explicit Office code change was requested, so no build was started.";
  if (classifyManagerRisk(`start_${builder}_build`, request) !== "green") return "This request is not green-light work, so no build was started.";
  const protectedCategory = officeBuildProtectedCategory(stripBuilderHandoffPrefix(request));
  if (protectedCategory) return `This request includes a protected action (${protectedCategory}), so no build was started.`;
  return null;
}
