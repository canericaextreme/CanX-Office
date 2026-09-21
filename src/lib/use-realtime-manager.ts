"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createManagerRealtimeSession } from "@/lib/manager-realtime.functions";
import { realtimeEventPhase, type ChatPhase } from "@/lib/use-realtime-chat";

export interface RealtimeManager {
  phase: ChatPhase;
  on: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useRealtimeManager(
  accessToken: string,
  team: { name: string; role: string; room: string }[],
  onTranscript: (role: "user" | "assistant", text: string) => void,
): RealtimeManager {
  const mintSession = useServerFn(createManagerRealtimeSession);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const teardown = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    setOn(false);
    setPhase("idle");
    setError(null);
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    if (!accessToken) {
      setPhase("error");
      setError("Sign in and complete the authenticator check before talking with Data.");
      return;
    }
    teardown();
    setError(null);
    setOn(true);
    setPhase("connecting");

    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;

      const session = await mintSession({ data: { accessToken, team } });
      if (!session.ok || !session.clientSecret || !session.model) {
        mic.getTracks().forEach((track) => track.stop());
        micRef.current = null;
        setOn(false);
        setPhase("error");
        setError(session.detail || "Data's voice conversation could not be started.");
        return;
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.muted = false;
      audio.volume = 1;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audio.play().catch(() => {
          setError(
            "Data is connected, but this browser blocked the sound. Check the device volume and tap Start conversation again.",
          );
        });
      };
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (event) => {
        let payload: { type?: string; transcript?: string };
        try {
          payload = JSON.parse(String(event.data)) as typeof payload;
        } catch {
          return;
        }
        const next = realtimeEventPhase(payload.type ?? "");
        if (next) setPhase(next);
        const text = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
        if (!text) return;
        if (payload.type === "conversation.item.input_audio_transcription.completed")
          transcriptRef.current("user", text);
        if (
          payload.type === "response.output_audio_transcript.done" ||
          payload.type === "response.audio_transcript.done"
        ) {
          transcriptRef.current("assistant", text);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST",
          body: offer.sdp ?? "",
          headers: {
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!answer.ok) throw new Error("sdp");
      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setPhase("listening");
    } catch {
      teardown();
      setOn(false);
      setPhase("error");
      setError(
        "Data could not open the microphone or reach the live voice service. Check microphone permission and try again.",
      );
    }
  }, [accessToken, mintSession, team, teardown]);

  return { phase, on, error, start: () => void start(), stop };
}
