/**
 * Small event bridge between the compact companion control and the existing
 * Office Manager. The companion never runs its own voice engine or provider
 * call: it asks the Office Manager to start/stop its own two-way voice, or to
 * show its own work panel, and listens for the Manager's real state.
 */

export const COMPANION_CHAT_EVENT = "canx:companion-chat";
export const COMPANION_WORK_EVENT = "canx:companion-work";
export const COMPANION_STATE_EVENT = "canx:manager-voice-state";
/** Kept so any remaining shortcut can re-show the companion. */
export const COMPANION_OPEN_EVENT = "canx:open-companion";

export interface ManagerVoiceState {
  /** Two-way voice conversation is switched on. */
  voiceMode: boolean;
  listening: boolean;
  speaking: boolean;
  thinking: boolean;
  /** The browser supports speech recognition at all. */
  supported: boolean;
  /** Short, plain-language problem text; never a transcript. */
  error: string | null;
}

export const IDLE_MANAGER_VOICE_STATE: ManagerVoiceState = {
  voiceMode: false,
  listening: false,
  speaking: false,
  thinking: false,
  supported: true,
  error: null,
};

export function managerVoiceLabel(state: ManagerVoiceState): string {
  if (!state.supported) return "Voice not supported in this browser";
  if (state.error) return state.error;
  if (state.thinking) return "Thinking";
  if (state.speaking) return "Speaking";
  if (state.listening) return "Listening";
  if (state.voiceMode) return "Voice on — paused";
  return "Ready";
}

/** True only while a real voice conversation is running. */
export function isVoiceActive(state: ManagerVoiceState): boolean {
  return state.listening || state.speaking;
}

export function requestCompanionChat() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_CHAT_EVENT));
}

export function requestCompanionWork() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_WORK_EVENT));
}

export function publishManagerVoiceState(state: ManagerVoiceState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ManagerVoiceState>(COMPANION_STATE_EVENT, { detail: state }));
}
