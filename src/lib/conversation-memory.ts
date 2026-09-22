/** Exact commands only: quoted, hypothetical and negative mentions do not save. */
export function requestsConversationSave(text: string): boolean {
  return /^(?:(?:data|please)[,\s]+)*(?:save (?:this|the) conversation)(?:\s+please)?[.!?]*$/i.test(text.trim());
}
export interface ConversationTurn { role: "user" | "assistant"; content: string }
export const MEMORY_NOTICE = 'Conversation is temporary. Say “Save this conversation” or press Save conversation to keep an office, build or ideas summary.';
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
