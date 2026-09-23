"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ManagerVoicePhase = "idle" | "listening" | "transcribing" | "preparing" | "speaking" | "blocked" | "error";

export interface ManagerVoiceReport {
  recorded: boolean;
  playbackStarted: boolean;
  playbackEnded: boolean;
  /** Plain-language name of the browser's playback refusal, never provider detail. */
  blockedReason: string | null;
  error: string | null;
}

const MAX_RECORDING_MS = 30_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * A very short silent WAV. Playing this inside the Talk tap is what actually
 * unlocks audio on Android Chrome and iPhone Safari: merely creating an
 * <audio> element does not count as user-activated playback.
 */
export const SILENT_AUDIO_DATA_URL =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const EMPTY_REPORT: ManagerVoiceReport = {
  recorded: false,
  playbackStarted: false,
  playbackEnded: false,
  blockedReason: null,
  error: null,
};

/** Turns a DOMException name into words John can act on. */
export function playbackRefusalMessage(name: string | null): string {
  if (name === "NotAllowedError") {
    return "Your phone blocked Astra's voice until you tap. Press Play Astra's answer to hear it.";
  }
  if (name === "NotSupportedError") {
    return "Your browser could not play that voice file. The written answer is still available.";
  }
  return "Your phone did not play Astra's voice. Press Play Astra's answer to try again.";
}

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
  const [report, setReport] = useState<ManagerVoiceReport>(EMPTY_REPORT);
  /** True when audio is already generated and paid for, but the browser refused to play it. */
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const recordingGenerationRef = useRef(0);
  const playbackGenerationRef = useRef(0);
  const startingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Microphone analyser context — closed with the recording. */
  const audioContextRef = useRef<AudioContext | null>(null);
  /** Playback context — created inside the user's tap and kept for the session. */
  const playbackContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  /** The already-generated answer audio, kept so a manual retry never re-runs TTS. */
  const bufferedRef = useRef<{ audioBase64: string; contentType: string; onEnded?: (() => void) | undefined } | null>(null);

  const releaseRecording = useCallback(() => {
    recordingGenerationRef.current += 1;
    startingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state === "recording") recorder.stop();
    }
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
    playbackGenerationRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    bufferedRef.current = null;
    setHasPendingAudio(false);
    setPhase((current) => current === "speaking" || current === "preparing" || current === "blocked" ? "idle" : current);
  }, []);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  /** Discard a recording; unlike Stop listening this never sends a turn. */
  const cancelListening = useCallback(() => {
    releaseRecording();
    setPhase("idle");
  }, [releaseRecording]);

  /**
   * Must be called synchronously from the click that starts any spoken answer.
   * It really plays inaudible audio and really resumes a Web Audio context, so
   * the later answer playback is already user-activated.
   */
  const unlockPlayback = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = document.createElement("audio");
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
    }
    // Never prime an active answer. A pending priming promise must not pause
    // or mute the real answer when it resolves later.
    if (audio.src) return;
    const generation = playbackGenerationRef.current;
    audio.src = SILENT_AUDIO_DATA_URL;
    audio.muted = true;
    const primed = audio.play();
    if (primed && typeof primed.then === "function") {
      void primed
        .then(() => {
          if (generation !== playbackGenerationRef.current) return;
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          if (generation !== playbackGenerationRef.current) return;
          audio.muted = false;
        });
    } else {
      audio.muted = false;
    }
    const AudioContextCtor =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      if (!playbackContextRef.current || playbackContextRef.current.state === "closed") {
        playbackContextRef.current = new AudioContextCtor();
      }
      const context = playbackContextRef.current;
      if (context && context.state !== "running") void context.resume().catch(() => undefined);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (startingRef.current || recorderRef.current?.state === "recording") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      const message = "This browser cannot record a Manager voice turn. You can still type your message.";
      setError(message);
      setPhase("error");
      return;
    }
    stopPlayback();
    releaseRecording();
    setError(null);
    setReport(EMPTY_REPORT);
    startingRef.current = true;
    const generation = recordingGenerationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== recordingGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      startingRef.current = false;
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
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation !== recordingGenerationRef.current) return;
        releaseRecording();
        const message = "The microphone stopped unexpectedly. Please press Talk and try again.";
        setError(message);
        setReport((current) => ({ ...current, error: message }));
        setPhase("error");
      };
      recorder.onstop = async () => {
        if (generation !== recordingGenerationRef.current) return;
        const actualType = recorder.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunks, { type: recorder.mimeType || actualType });
        releaseRecording();
        const stoppedGeneration = recordingGenerationRef.current;
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
          const encoded = await toBase64(blob);
          if (stoppedGeneration !== recordingGenerationRef.current) return;
          await onTurn(encoded, actualType);
        } catch {
          if (stoppedGeneration !== recordingGenerationRef.current) return;
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
      if (generation !== recordingGenerationRef.current) return;
      releaseRecording();
      const message = "Microphone access is needed. Allow it in your browser, then press Talk again.";
      setError(message);
      setReport((current) => ({ ...current, error: message }));
      setPhase("error");
    }
  }, [onTurn, releaseRecording, stopListening, stopPlayback]);

  /** Plays whatever audio is already buffered. Never asks the provider again. */
  const attemptPlayback = useCallback(async () => {
    const buffered = bufferedRef.current;
    if (!buffered) return false;
    // The microphone must be fully released before any audible playback.
    releaseRecording();
    stopPlayback();
    bufferedRef.current = buffered;
    const generation = playbackGenerationRef.current;
    setError(null);
    setPhase("preparing");
    try {
      const binary = atob(buffered.audioBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: buffered.contentType }));
      objectUrlRef.current = url;
      let audio = audioRef.current;
      if (!audio) {
        audio = document.createElement("audio");
        audio.setAttribute("playsinline", "true");
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioRef.current = audio;
      }
      if (!audio) throw new Error("audio");
      audio.muted = false;
      audio.onplay = () => {
        if (generation !== playbackGenerationRef.current) return;
        setReport((current) => ({ ...current, playbackStarted: true, blockedReason: null }));
        setPhase("speaking");
      };
      audio.onended = () => {
        if (generation !== playbackGenerationRef.current) return;
        setReport((current) => ({ ...current, playbackEnded: true }));
        bufferedRef.current = null;
        setHasPendingAudio(false);
        setPhase("idle");
        // Listening only ever restarts once playback has genuinely finished.
        buffered.onEnded?.();
      };
      audio.onerror = () => {
        if (generation !== playbackGenerationRef.current) return;
        setHasPendingAudio(true);
        const message = "Your phone could not play the Manager's voice. The written answer is still available.";
        setError(message);
        setReport((current) => ({ ...current, error: message }));
        setPhase("error");
      };
      audio.src = url;
      await audio.play();
      if (generation !== playbackGenerationRef.current) return false;
      setHasPendingAudio(false);
      return true;
    } catch (caught) {
      if (generation !== playbackGenerationRef.current) return false;
      const name = caught instanceof Error && caught.name ? caught.name : null;
      const message = playbackRefusalMessage(name);
      setError(message);
      setReport((current) => ({ ...current, blockedReason: name, error: message }));
      // The generated audio is kept so the manual retry costs nothing extra.
      setHasPendingAudio(true);
      setPhase("blocked");
      return false;
    }
  }, [releaseRecording, stopPlayback]);

  const playAudio = useCallback(
    async (audioBase64: string, contentType = "audio/mpeg", onEnded?: () => void) => {
      bufferedRef.current = { audioBase64, contentType, onEnded };
      return attemptPlayback();
    },
    [attemptPlayback],
  );

  /** The manual playback retry. Runs from John's own tap, with no new TTS call. */
  const playPendingAudio = useCallback(async () => {
    unlockPlayback();
    return attemptPlayback();
  }, [attemptPlayback, unlockPlayback]);

  /**
   * Device voice is the no-cost safety net when the hosted speech provider
   * refuses a request. It keeps Astra audible and preserves the same
   * speak-then-listen turn order.
   */
  const speakLocally = useCallback((text: string, onEnded?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      return false;
    }
    releaseRecording();
    stopPlayback();
    const generation = playbackGenerationRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-CA";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) =>
      /^en(-|_)/i.test(voice.lang) && /natural|google|microsoft/i.test(voice.name),
    ) ?? voices.find((voice) => /^en(-|_)/i.test(voice.lang)) ?? null;
    utterance.onstart = () => {
      if (generation !== playbackGenerationRef.current) return;
      setError(null);
      setReport((current) => ({ ...current, playbackStarted: true, blockedReason: null, error: null }));
      setPhase("speaking");
    };
    utterance.onend = () => {
      if (generation !== playbackGenerationRef.current) return;
      utteranceRef.current = null;
      setReport((current) => ({ ...current, playbackEnded: true }));
      setPhase("idle");
      onEnded?.();
    };
    utterance.onerror = () => {
      if (generation !== playbackGenerationRef.current) return;
      utteranceRef.current = null;
      const message = "Your browser could not start Astra's voice. The written answer is still available.";
      setError(message);
      setReport((current) => ({ ...current, error: message }));
      setPhase("error");
    };
    utteranceRef.current = utterance;
    setError(null);
    setPhase("preparing");
    window.speechSynthesis.speak(utterance);
    return true;
  }, [releaseRecording, stopPlayback]);

  useEffect(() => () => {
    releaseRecording();
    playbackGenerationRef.current += 1;
    bufferedRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.remove();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const context = playbackContextRef.current;
    playbackContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, [releaseRecording]);

  return {
    phase,
    error,
    report,
    hasPendingAudio,
    startListening,
    stopListening,
    cancelListening,
    playAudio,
    playPendingAudio,
    speakLocally,
    stopPlayback,
    unlockPlayback,
    setPhase,
  };
}
