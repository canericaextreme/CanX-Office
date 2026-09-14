"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ManagerVoicePhase = "idle" | "listening" | "transcribing" | "preparing" | "speaking" | "error";

export interface ManagerVoiceReport {
  recorded: boolean;
  playbackStarted: boolean;
  playbackEnded: boolean;
  error: string | null;
}

const MAX_RECORDING_MS = 30_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function preferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("recording"));
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

export function useManagerVoice(onTurn: (audioBase64: string, mimeType: string) => Promise<void>) {
  const [phase, setPhase] = useState<ManagerVoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ManagerVoiceReport>({ recorded: false, playbackStarted: false, playbackEnded: false, error: null });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const releaseRecording = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, []);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (phase === "speaking" || phase === "preparing") setPhase("idle");
  }, [phase]);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const startListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const message = "This browser cannot record a Manager voice turn. You can still type your message.";
      setError(message);
      setPhase("error");
      return;
    }
    stopPlayback();
    releaseRecording();
    setError(null);
    setReport({ recorded: false, playbackStarted: false, playbackEnded: false, error: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const context = AudioContextCtor ? new AudioContextCtor() : null;
      audioContextRef.current = context;
      const analyser = context?.createAnalyser() ?? null;
      if (context && analyser) {
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
      }
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        releaseRecording();
        const message = "The microphone stopped unexpectedly. Please press Talk and try again.";
        setError(message);
        setReport((current) => ({ ...current, error: message }));
        setPhase("error");
      };
      recorder.onstop = async () => {
        const actualType = recorder.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || actualType });
        releaseRecording();
        if (blob.size < 256 || blob.size > MAX_AUDIO_BYTES) {
          const message = blob.size > MAX_AUDIO_BYTES ? "That voice turn was too long. Please try a shorter message." : "No voice was recorded. Please try again.";
          setError(message);
          setReport((current) => ({ ...current, error: message }));
          setPhase("error");
          return;
        }
        setReport((current) => ({ ...current, recorded: true }));
        setPhase("transcribing");
        try {
          await onTurn(await toBase64(blob), actualType);
        } catch {
          const message = "The Manager could not process that voice turn. Please try again or type your message.";
          setError(message);
          setReport((current) => ({ ...current, error: message }));
          setPhase("error");
        }
      };
      recorder.start();
      setPhase("listening");
      if (analyser) {
        const levels = new Uint8Array(analyser.fftSize);
        let heardSpeech = false;
        let quietSince = Date.now();
        const watchSilence = () => {
          if (recorder.state !== "recording") return;
          analyser.getByteTimeDomainData(levels);
          let sum = 0;
          for (const value of levels) {
            const normalized = (value - 128) / 128;
            sum += normalized * normalized;
          }
          const volume = Math.sqrt(sum / levels.length);
          if (volume > 0.025) {
            heardSpeech = true;
            quietSince = Date.now();
          } else if (heardSpeech && Date.now() - quietSince > 1400) {
            recorder.stop();
            return;
          }
          animationRef.current = requestAnimationFrame(watchSilence);
        };
        animationRef.current = requestAnimationFrame(watchSilence);
      }
      timerRef.current = setTimeout(() => stopListening(), MAX_RECORDING_MS);
    } catch {
      releaseRecording();
      const message = "Microphone access is needed. Allow it in your browser, then press Talk again.";
      setError(message);
      setReport((current) => ({ ...current, error: message }));
      setPhase("error");
    }
  }, [onTurn, releaseRecording, stopListening, stopPlayback]);

  const unlockPlayback = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = document.createElement("audio");
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
    }
    const context = audioContextRef.current;
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  }, []);

  const playAudio = useCallback(async (audioBase64: string, contentType = "audio/mpeg", onEnded?: () => void) => {
    releaseRecording();
    stopPlayback();
    setError(null);
    setPhase("preparing");
    try {
      const binary = atob(audioBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
      objectUrlRef.current = url;
      let audio = audioRef.current;
      if (!audio) {
        unlockPlayback();
        audio = audioRef.current;
      }
      if (!audio) throw new Error("audio");
      audio.onplay = () => {
        setReport((current) => ({ ...current, playbackStarted: true }));
        setPhase("speaking");
      };
      audio.onended = () => {
        setReport((current) => ({ ...current, playbackEnded: true }));
        setPhase("idle");
        onEnded?.();
      };
      audio.onerror = () => {
        const message = "Your phone could not play the Manager's voice. The written answer is still available.";
        setError(message);
        setReport((current) => ({ ...current, error: message }));
        setPhase("error");
      };
      audio.src = url;
      await audio.play();
      return true;
    } catch {
      const message = "Your phone blocked the Manager's voice. Press Play answer to try again.";
      setError(message);
      setReport((current) => ({ ...current, error: message }));
      setPhase("error");
      return false;
    }
  }, [releaseRecording, stopPlayback, unlockPlayback]);

  useEffect(() => () => {
    releaseRecording();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.remove();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, [releaseRecording]);

  return { phase, error, report, startListening, stopListening, playAudio, stopPlayback, unlockPlayback, setPhase };
}