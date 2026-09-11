"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-only speech helpers. No paid service, no subscription, no secret and
 * no recording is ever stored: the browser's own speech features turn sound
 * into words, and only the written words are kept.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as (new () => SpeechRecognitionLike) | null;
}

export interface DictationOptions {
  /** Called with each finished phrase the browser recognised. */
  onFinal: (text: string) => void;
  /** Called once the speaker has paused for a moment, if anything was heard. */
  onPause?: () => void;
  /** How long a pause counts as "finished speaking", in milliseconds. */
  pauseMs?: number;
}

export interface DictationState {
  supported: boolean;
  listening: boolean;
  /** Words the browser is still hearing, shown live and not yet confirmed. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useDictation(options: DictationOptions): DictationState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardSinceStart = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      try {
        recRef.current?.abort();
      } catch {
        /* nothing to stop */
      }
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError(null);
    heardSinceStart.current = false;
    try {
      const rec = new Ctor();
      rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-CA" : "en-CA";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event: any) => {
        let finalText = "";
        let live = "";
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript ?? "";
          if (result?.isFinal) finalText += transcript;
          else live += transcript;
        }
        setInterim(live);
        const trimmed = finalText.trim();
        if (trimmed) {
          heardSinceStart.current = true;
          optionsRef.current.onFinal(trimmed);
        }
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        pauseTimer.current = setTimeout(() => {
          if (heardSinceStart.current) {
            heardSinceStart.current = false;
            setInterim("");
            optionsRef.current.onPause?.();
          }
        }, optionsRef.current.pauseMs ?? 1600);
      };
      rec.onerror = (event: any) => {
        const code = typeof event?.error === "string" ? event.error : "unknown";
        if (code === "no-speech" || code === "aborted") {
          setListening(false);
          return;
        }
        setError(
          code === "not-allowed" || code === "service-not-allowed"
            ? "Microphone access was refused, so nothing was heard. Allow the microphone in your browser and press Talk again."
            : "Voice input stopped unexpectedly. You can type your message instead.",
        );
        setListening(false);
      };
      rec.onend = () => {
        setListening(false);
        setInterim("");
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("Voice input could not start on this device. You can type your message instead.");
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}

export interface ReadAloudState {
  supported: boolean;
  speakingId: string | null;
  speak: (id: string, text: string, onDone?: () => void) => void;
  stop: () => void;
}

/** Speaks only when asked to — by a button press, or by Voice Mode being on. */
export function useReadAloud(): ReadAloudState {
  const [supported, setSupported] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback((id: string, text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.onend = () => {
      setSpeakingId(null);
      onDone?.();
    };
    utterance.onerror = () => {
      setSpeakingId(null);
      onDone?.();
    };
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }, []);

  return { supported, speakingId, speak, stop };
}
