"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createManagerRealtimeSession } from "@/lib/manager-realtime.functions";
import { realtimeEventPhase, type ChatPhase } from "@/lib/use-realtime-chat";

export interface RealtimeManager {
  phase: ChatPhase;
  on: boolean;
  error: string | null;
  playbackBlocked: boolean;
  resumeAudio: () => void;
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
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const teardown = useCallback(() => {
    // Invalidate pending permission, minting, SDP and playback callbacks first.
    generationRef.current += 1;
    activeRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) { channel.onmessage = null; channel.onclose = null; channel.close(); }
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
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
    setPlaybackBlocked(false);
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);
  // A signed-out owner must not leave an already-open microphone running.
  useEffect(() => { if (!accessToken) stop(); }, [accessToken, stop]);

  const playAudio = useCallback(async (audio: HTMLAudioElement, generation: number) => {
    try {
      await audio.play();
      if (generation !== generationRef.current) return;
      setPlaybackBlocked(false);
      setError(null);
    } catch {
      if (generation !== generationRef.current) return;
      setPlaybackBlocked(true);
      setError("Your browser blocked Data's sound. Tap Enable sound to hear this conversation.");
    }
  }, []);

  const resumeAudio = useCallback(() => {
    if (audioRef.current) void playAudio(audioRef.current, generationRef.current);
  }, [playAudio]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    if (!accessToken) {
      setPhase("error");
      setError("Sign in and complete the authenticator check before talking with Data.");
      return;
    }
    teardown();
    const generation = generationRef.current;
    const current = () => generation === generationRef.current;
    activeRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    setPlaybackBlocked(false);
    setOn(true);
    setPhase("connecting");
    const fail = (message: string) => {
      if (!current()) return;
      teardown();
      setOn(false);
      setPlaybackBlocked(false);
      setPhase("error");
      setError(message);
    };
    const timeout = setTimeout(() => fail("Data's voice connection timed out. Please try again."), 30_000);

    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current()) { mic.getTracks().forEach((track) => track.stop()); return; }
      micRef.current = mic;

      const session = await mintSession({ data: { accessToken, team } });
      if (!current()) return;
      if (!session.ok || !session.clientSecret || !session.model) {
        fail(session.detail || "Data's voice conversation could not be started.");
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
        if (!current()) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void playAudio(audio, generation);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed")
          fail("Data's voice connection ended. Press Start conversation to reconnect.");
      };
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onclose = () => fail("Data's voice connection ended. Press Start conversation to reconnect.");
      channel.onmessage = (event) => {
        if (!current()) return;
        let payload: { type?: string; transcript?: string; response?: { status?: string } };
        try { payload = JSON.parse(String(event.data)) as typeof payload; }
        catch { return; }
        if (payload.type === "error" || (payload.type === "response.done" && payload.response?.status === "failed")) {
          fail("The voice service could not continue this conversation. Please try again.");
          return;
        }
        const next = realtimeEventPhase(payload.type ?? "");
        if (next) setPhase(next);
        const text = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
        if (!text) return;
        if (payload.type === "conversation.item.input_audio_transcription.completed")
          transcriptRef.current("user", text);
        if (payload.type === "response.output_audio_transcript.done" || payload.type === "response.audio_transcript.done")
          transcriptRef.current("assistant", text);
      };

      const offer = await pc.createOffer();
      if (!current()) return;
      await pc.setLocalDescription(offer);
      if (!current()) return;
      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST", body: offer.sdp ?? "", signal: abort.signal,
          headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
        },
      );
      if (!current()) return;
      if (!answer.ok) throw new Error("sdp");
      const sdp = await answer.text();
      if (!current()) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
      if (current()) setPhase("listening");
    } catch {
      fail("Data could not open the microphone or reach the live voice service. Check microphone permission and try again.");
    } finally {
      clearTimeout(timeout);
    }
  }, [accessToken, mintSession, team, teardown, playAudio]);

  return { phase, on, error, playbackBlocked, resumeAudio, start: () => void start(), stop };
}
