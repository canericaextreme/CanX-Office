/**
 * CanX Chat — the conversational companion.
 *
 * Chat is a real two-way spoken conversation with the CanX-owned AI account,
 * carried over WebRTC with a server-minted short-lived client secret. The
 * permanent key never reaches the browser.
 *
 * It deliberately does NOT use the browser's speech-synthesis voice: the
 * assistant's audio is the provider's own natural voice, streamed back over
 * the same connection. The Office Manager remains the operational agent; Chat
 * consults it through the explicit `ask_office_manager` handoff.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { managerChat, type ManagerReply } from "@/lib/manager.functions";
import { createRealtimeSession } from "@/lib/realtime-voice.functions";

export type ChatPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "needs_approval"
  | "error";

export const CHAT_PHASE_LABEL: Record<ChatPhase, string> = {
  idle: "Ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  needs_approval: "Needs approval",
  error: "Chat unavailable",
};

/** Only a live conversation counts as active; connecting and errors do not. */
export function isChatActive(phase: ChatPhase): boolean {
  return phase === "listening" || phase === "thinking" || phase === "speaking";
}

/** Maps a realtime event name to the state the companion should show. */
export function realtimeEventPhase(type: string): ChatPhase | null {
  if (type === "input_audio_buffer.speech_started") return "listening";
  if (type === "input_audio_buffer.speech_stopped") return "thinking";
  if (type === "response.created") return "thinking";
  if (type === "response.output_audio.delta" || type === "response.audio.delta") return "speaking";
  if (type === "response.done" || type === "response.cancelled") return "listening";
  return null;
}

export interface HandoffOutcome {
  /** Spoken-language result handed back to Chat. Never raw provider detail. */
  text: string;
  /** True when the Manager parked something for John's approval or stopped it. */
  needsApproval: boolean;
}

/**
 * Turns an Office Manager reply into something Chat can say out loud, and
 * preserves the approval boundary: pending or stopped work is reported as
 * waiting for John, never as done.
 */
export function managerHandoffOutput(reply: ManagerReply): HandoffOutcome {
  if (!reply.ok) {
    return { text: reply.detail ?? "The Office Manager could not answer that.", needsApproval: false };
  }
  const parts: string[] = [];
  if (reply.text) parts.push(reply.text);
  let needsApproval = false;
  for (const action of reply.actionResults ?? []) {
    if (action.status === "pending") {
      needsApproval = true;
      parts.push(`Waiting for John's approval: ${action.detail}`);
    } else if (action.status === "stopped") {
      needsApproval = true;
      parts.push(`Stopped, John has to do this himself: ${action.detail}`);
    } else {
      parts.push(action.detail);
    }
  }
  return { text: parts.join(" ").trim() || "The Office Manager had nothing to report.", needsApproval };
}

export interface RealtimeChat {
  phase: ChatPhase;
  active: boolean;
  /** True from the moment Chat is switched on until it is switched off. */
  on: boolean;
  /** Short, plain-language problem text. Never a transcript or provider body. */
  error: string | null;
  /** Exact server setting John still has to supply, when that is the blocker. */
  missingSetting: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useRealtimeChat(): RealtimeChat {
  const { state: ownerState, accessToken } = useOwnerSession();
  const mintSession = useServerFn(createRealtimeSession);
  const askManager = useServerFn(managerChat);

  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSetting, setMissingSetting] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);

  const teardown = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    setOn(false);
    setPhase("idle");
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const handleHandoff = useCallback(
    async (callId: string, request: string) => {
      const channel = channelRef.current;
      if (!channel || !accessToken) return;
      setPhase("thinking");
      let outcome: HandoffOutcome;
      try {
        const reply = (await askManager({
          data: { accessToken, messages: [{ role: "user", content: request }] },
        })) as ManagerReply;
        outcome = managerHandoffOutput(reply);
      } catch {
        outcome = { text: "The Office Manager could not be reached just now.", needsApproval: false };
      }
      if (outcome.needsApproval) setPhase("needs_approval");
      if (channel.readyState !== "open") return;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callId, output: outcome.text },
        }),
      );
      channel.send(JSON.stringify({ type: "response.create" }));
    },
    [accessToken, askManager],
  );

  const start = useCallback(async () => {
    if (ownerState !== "owner" || !accessToken) {
      setPhase("error");
      setError("Sign in as the owner with two-step verification to use Chat.");
      return;
    }
    setError(null);
    setMissingSetting(null);
    setOn(true);
    setPhase("connecting");

    const session = await mintSession({ data: { accessToken } }).catch(() => null);
    if (!session || !session.ok || !session.clientSecret || !session.model) {
      setPhase("error");
      setError(session?.detail ?? "The voice session could not be started.");
      setMissingSetting(session?.missingSetting ?? null);
      setOn(false);
      return;
    }

    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
      };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (event) => {
        let payload: { type?: string; name?: string; call_id?: string; arguments?: string };
        try {
          payload = JSON.parse(String(event.data)) as typeof payload;
        } catch {
          return;
        }
        const next = realtimeEventPhase(payload.type ?? "");
        if (next) setPhase(next);
        if (payload.type === "response.function_call_arguments.done" && payload.name === "ask_office_manager") {
          let request = "";
          try {
            request = String((JSON.parse(payload.arguments ?? "{}") as { request?: unknown }).request ?? "");
          } catch {
            request = "";
          }
          if (request && payload.call_id) void handleHandoff(payload.call_id, request);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`, {
        method: "POST",
        body: offer.sdp ?? "",
        headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!answer.ok) throw new Error("sdp");
      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setPhase("listening");
    } catch {
      teardown();
      setOn(false);
      setPhase("error");
      setError("Chat could not open the microphone or reach the voice service. Check microphone permission and try again.");
    }
  }, [accessToken, handleHandoff, mintSession, ownerState, teardown]);

  const toggle = useCallback(() => {
    if (on) stop();
    else void start();
  }, [on, start, stop]);

  return { phase, active: isChatActive(phase), on, error, missingSetting, start: () => void start(), stop, toggle };
}
