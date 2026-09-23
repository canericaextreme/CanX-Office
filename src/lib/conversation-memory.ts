/** Exact commands only: quoted, hypothetical and negative mentions do not save. */
export function requestsConversationSave(text: string): boolean {
  return /^(?:(?:astra|data|please)[,\s]+)*(?:save (?:this|the) conversation)(?:\s+please)?[.!?]*$/i.test(text.trim());
}
export interface ConversationTurn { role: "user" | "assistant"; content: string }
export const MEMORY_NOTICE = 'Continuity rule: useful office, build and idea discussion is summarized after a pause while this window stays open. Chatter is excluded. Only a verified Brain save survives closing. Say “Save this conversation” to save now.';
export function conversationForSummary(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  let remaining = 24000;
  const turns: ConversationTurn[] = [];
  for (const row of raw.slice(-100).reverse()) {
    if (!row || (row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") continue;
    const content = row.content.trim();
    if (!content || requestsConversationSave(content)) continue;
    if (!remaining) break;
    const bounded = content.slice(0, Math.min(6000, remaining));
    remaining -= bounded.length;
    turns.unshift({ role: row.role, content: bounded });
  }
  return turns;
}

/** Cheap candidate filter; the server summary still excludes chatter and unsupported claims. */
export function shouldCheckpointConversation(raw: unknown): boolean {
  const turns = conversationForSummary(raw);
  const users = turns.filter(turn => turn.role === "user");
  if (!users.length || turns.at(-1)?.role !== "assistant") return false;
  if (users.some(turn => /\b(?:do not|don't|don’t|never) (?:save|remember|record)|\boff the record\b/i.test(turn.content))) return false;
  return users.some(turn => /\b(?:office|canx|astra|project|build|app|website|book|manuscript|idea|goal|decision|receipt|budget|highways|trail tales|research|approve|task)\b/i.test(turn.content));
}
