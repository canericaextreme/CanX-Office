/**
 * Turns an Office Manager reply into a voice-turn outcome. A usable assistant
 * answer always wins: an error detail is never rendered or spoken as if it
 * were Astra's reply, and a generic "busy" message never replaces real text.
 */
export type VoiceFailureStage =
  | "transcription"
  | "office_rate_limit"
  | "office_budget"
  | "provider_check"
  | "assistant_provider"
  | "response_parse"
  | "response_stream"
  | "text_rendering"
  | "speech_playback"
  | "other";

export interface VoiceReplyLike {
  ok: boolean;
  text?: string;
  detail?: string;
  failedStage?: string;
  providerStatus?: number;
  code?: string;
}

export class VoiceTurnError extends Error {
  constructor(readonly stage: VoiceFailureStage, readonly userMessage: string, readonly status?: number) {
    super(`voice turn failed at ${stage}`);
    this.name = "VoiceTurnError";
  }
}

const KNOWN: VoiceFailureStage[] = ["office_rate_limit", "office_budget", "provider_check", "assistant_provider", "response_parse"];

export function voiceTurnOutcome(reply: VoiceReplyLike):
  | { kind: "answer"; text: string; partialFailure?: VoiceFailureStage }
  | { kind: "failure"; stage: VoiceFailureStage; message: string; status?: number } {
  const text = (reply.text ?? "").trim();
  if (text) {
    return reply.ok ? { kind: "answer", text } : { kind: "answer", text, partialFailure: stageOf(reply) };
  }
  return {
    kind: "failure",
    stage: stageOf(reply),
    message: `Astra heard you, but no answer was produced. ${reply.detail?.trim() || "The office request did not complete."}`,
    ...(reply.providerStatus ? { status: reply.providerStatus } : {}),
  };
}

function stageOf(reply: VoiceReplyLike): VoiceFailureStage {
  const s = reply.failedStage as VoiceFailureStage | undefined;
  return s && KNOWN.includes(s) ? s : "other";
}

/** Safe diagnostic record: never includes transcript text, audio, or secrets. */
export function voiceDiagnostic(stage: VoiceFailureStage, startedAt: number, retries: number, status?: number) {
  return { stage, status: status ?? null, ms: Math.max(0, Date.now() - startedAt), retries };
}
