import type { VoiceTurnContextResult } from "./manager-realtime.functions";

export const VOICE_REFRESH_GAP_NOTE =
  "Durable memory and office records could NOT be refreshed for this spoken turn. Answer only from the previously verified session context, say that it may be out of date if relevant, and do not claim to remember anything newer.";

/**
 * Events sent after a completed spoken turn once the per-turn refresh settles.
 * Fresh instructions apply to this reply only; a failed refresh is stated
 * plainly and the reply falls back to the previously verified session context.
 */
export function voiceTurnEvents(result: VoiceTurnContextResult | null, inputId = ""): Record<string, unknown>[] {
  // Voice is the interface; the guarded Office adapter owns reasoning and actions.
  // Force this route even for ordinary conversation and when refresh fails.
  const response = {
    tool_choice: { type: "function", name: "submit_office_request" },
    metadata: { office_input_id: inputId },
    output_modalities: ["audio"],
  };
  if (result?.ok) return [{ type: "response.create", response: { ...response, instructions: result.instructions } }];
  // Realtime conversation items do not accept a system role. A rejected item
  // previously left the turn with no reply even though the call stayed green.
  return [{ type: "response.create", response: { ...response, instructions: VOICE_REFRESH_GAP_NOTE } }];
}
