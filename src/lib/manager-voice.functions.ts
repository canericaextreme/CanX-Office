import { createServerFn } from "@tanstack/react-start";

export type ManagerVoiceCode =
  | "ok"
  | "auth_not_ready"
  | "not_configured"
  | "limit_blocked"
  | "invalid_audio"
  | "provider_error";

export interface ManagerTranscriptionResult {
  ok: boolean;
  code: ManagerVoiceCode;
  text: string;
  detail: string;
}

export interface ManagerSpeechResult {
  ok: boolean;
  code: ManagerVoiceCode;
  audioBase64: string;
  contentType: "audio/mpeg";
  detail: string;
}

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_SPEECH_CHARS = 1800;
const VOICE_TIMEOUT_MS = 30_000;
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"]);

function readSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function providerDetail(status?: number): string {
  if (status === 401) return "The OpenAI voice key was not accepted.";
  if (status === 403) return "The OpenAI key can answer in writing but does not have permission to create speech.";
  if (status === 429) return "The Manager voice service is busy. Please try again shortly.";
  if (status && status >= 500) return "The Manager voice service is temporarily unavailable.";
  return "The Manager voice could not complete that audio request.";
}

function decodeAudio(audioBase64: string): Uint8Array | null {
  if (!audioBase64 || audioBase64.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 16) return null;
  try {
    const bytes = Uint8Array.from(atob(audioBase64), (character) => character.charCodeAt(0));
    return bytes.length >= 256 && bytes.length <= MAX_AUDIO_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

async function voiceDeps(accessToken: string) {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  // Transcription and speech are paid Astra calls and the reservation function
  // already requires an AAL2 owner session. Check that requirement first so
  // the UI receives the correct authenticator message.
  const verification = await backend.verifyOwnerWith(config, accessToken);
  return { backend, config, verification };
}

export const transcribeManagerAudio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = input as { accessToken?: unknown; audioBase64?: unknown; mimeType?: unknown };
    return {
      accessToken: typeof value?.accessToken === "string" ? value.accessToken.slice(0, 4000) : "",
      audioBase64: typeof value?.audioBase64 === "string" ? value.audioBase64 : "",
      mimeType: typeof value?.mimeType === "string" ? (value.mimeType.split(";")[0] ?? "").slice(0, 40) : "",
    };
  })
  .handler(async ({ data }): Promise<ManagerTranscriptionResult> => {
    const { backend, config, verification } = await voiceDeps(data.accessToken);
    if (!verification.ok) return { ok: false, code: "auth_not_ready", text: "", detail: verification.message };
    const key = readSetting(process.env["OPENAI_API_KEY"]);
    if (!key) return { ok: false, code: "not_configured", text: "", detail: "The Manager voice is not configured." };
    const bytes = decodeAudio(data.audioBase64);
    if (!bytes || !AUDIO_TYPES.has(data.mimeType)) {
      return { ok: false, code: "invalid_audio", text: "", detail: "That recording was empty or could not be read. Please try again." };
    }
    const reservation = await backend.reserveAiCallWith(config, data.accessToken, 2);
    if (!reservation.allowed) return { ok: false, code: "limit_blocked", text: "", detail: reservation.message };
    const extension = data.mimeType === "audio/mp4" ? "mp4" : data.mimeType === "audio/mpeg" ? "mp3" : data.mimeType === "audio/wav" ? "wav" : data.mimeType === "audio/ogg" ? "ogg" : "webm";
    const body = new FormData();
    body.append("model", readSetting(process.env["OPENAI_TRANSCRIBE_MODEL"]) ?? "gpt-4o-mini-transcribe");
    const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    body.append("file", new Blob([audioBuffer], { type: data.mimeType }), `manager-turn.${extension}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}` },
        body,
      });
      if (!response.ok) {
        await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "failed");
        return { ok: false, code: "provider_error", text: "", detail: providerDetail(response.status) };
      }
      const payload = (await response.json()) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 6000) : "";
      await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, text ? "ok" : "failed");
      return text
        ? { ok: true, code: "ok", text, detail: "" }
        : { ok: false, code: "invalid_audio", text: "", detail: "No words were heard. Please try again." };
    } catch {
      await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "failed");
      return { ok: false, code: "provider_error", text: "", detail: providerDetail() };
    } finally {
      clearTimeout(timer);
    }
  });

export const speakManagerText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = input as { accessToken?: unknown; text?: unknown };
    return {
      accessToken: typeof value?.accessToken === "string" ? value.accessToken.slice(0, 4000) : "",
      text: typeof value?.text === "string" ? value.text.trim().slice(0, MAX_SPEECH_CHARS) : "",
    };
  })
  .handler(async ({ data }): Promise<ManagerSpeechResult> => {
    const { backend, config, verification } = await voiceDeps(data.accessToken);
    if (!verification.ok) return { ok: false, code: "auth_not_ready", audioBase64: "", contentType: "audio/mpeg", detail: verification.message };
    const key = readSetting(process.env["OPENAI_API_KEY"]);
    if (!key) return { ok: false, code: "not_configured", audioBase64: "", contentType: "audio/mpeg", detail: "The Manager voice is not configured." };
    if (!data.text) return { ok: false, code: "invalid_audio", audioBase64: "", contentType: "audio/mpeg", detail: "There is no answer to speak." };
    const reservation = await backend.reserveAiCallWith(config, data.accessToken, 2);
    if (!reservation.allowed) return { ok: false, code: "limit_blocked", audioBase64: "", contentType: "audio/mpeg", detail: reservation.message };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);
    try {
      const preferredModel = readSetting(process.env["OPENAI_TTS_MODEL"]) ?? "gpt-4o-mini-tts";
      const requestSpeech = (model: string) => fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          voice: "alloy",
          input: data.text,
          ...(model === "tts-1" ? {} : { instructions: "Speak warmly, clearly, and naturally as John's professional CanX Office Manager." }),
          response_format: "mp3",
        }),
      });
      let response = await requestSpeech(preferredModel);
      // Restricted project keys sometimes allow the legacy low-latency speech
      // model but not the preferred model. A permission/model refusal produces
      // no audio and no useful charge, so try the documented fallback once.
      if ((response.status === 403 || response.status === 404) && preferredModel !== "tts-1") {
        await response.body?.cancel().catch(() => undefined);
        response = await requestSpeech("tts-1");
      }
      if (!response.ok) {
        await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "failed");
        return { ok: false, code: "provider_error", audioBase64: "", contentType: "audio/mpeg", detail: providerDetail(response.status) };
      }
      const audio = new Uint8Array(await response.arrayBuffer());
      if (!audio.length || audio.length > MAX_AUDIO_BYTES) {
        await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "failed");
        return { ok: false, code: "provider_error", audioBase64: "", contentType: "audio/mpeg", detail: "The Manager voice returned unusable audio." };
      }
      await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "ok");
      return { ok: true, code: "ok", audioBase64: Buffer.from(audio).toString("base64"), contentType: "audio/mpeg", detail: "" };
    } catch {
      await backend.settleAiCallWith(config, data.accessToken, reservation.reservationId, "failed");
      return { ok: false, code: "provider_error", audioBase64: "", contentType: "audio/mpeg", detail: providerDetail() };
    } finally {
      clearTimeout(timer);
    }
  });
