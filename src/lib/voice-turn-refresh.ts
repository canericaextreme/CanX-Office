import type { VoiceTurnContextResult } from "./manager-realtime.functions";

export const VOICE_REFRESH_GAP_NOTE =
  "Durable memory and office records could NOT be refreshed for this spoken turn. Answer only from the previously verified session context, say that it may be out of date if relevant, and do not claim to remember anything newer.";

/**
 * Events sent after a completed spoken turn once the per-turn refresh settles.
 * Fresh instructions apply to this reply only; a failed refresh is stated
 * plainly and the reply falls back to the previously verified session context.
 */
export function voiceTurnEvents(result: VoiceTurnContextResult | null): Record<string, unknown>[] {
  if (result?.ok) return [{ type: "response.create", response: { instructions: result.instructions } }];
  return [
    { type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: VOICE_REFRESH_GAP_NOTE }] } },
    { type: "response.create" },
  ];
}
