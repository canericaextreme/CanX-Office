"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-only speech helpers. No paid service, no secrets, no network calls of
 * our own: this uses the speech features already built into the browser.
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

export interface DictationState {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Dictation. Recognised words are handed back through `onText` so the caller can
 * put them in the message box for the owner to read and correct. Nothing is ever
 * sent automatically.
 */
export function useDictation(onText: (text: string) => void): DictationState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef(onText);
  textRef.current = onText;

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* nothing to stop */
      }
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setError(null);
    try {
      const rec = new Ctor();
      rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-CA" : "en-CA";
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (event: any) => {
        let heard = "";
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result?.isFinal && result[0]?.transcript) heard += result[0].transcript;
        }
        const trimmed = heard.trim();
        if (trimmed) textRef.current(trimmed);
      };
      rec.onerror = (event: any) => {
        const code = typeof event?.error === "string" ? event.error : "unknown";
        setError(
          code === "not-allowed" || code === "service-not-allowed"
            ? "Microphone access was refused, so nothing was heard. Allow the microphone in your browser and press Talk again."
            : code === "no-speech"
              ? "Nothing was heard. Press Talk and speak again."
              : "Voice input stopped unexpectedly. You can type your message instead.",
        );
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("Voice input could not start on this device. You can type your message instead.");
      setListening(false);
    }
  }, []);

  return { supported, listening, error, start, stop };
}

export interface ReadAloudState {
  supported: boolean;
  speakingId: string | null;
  speak: (id: string, text: string) => void;
  stop: () => void;
}

/** Read aloud on request only — never autoplayed. */
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

  const speak = useCallback(
    (id: string, text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  return { supported, speakingId, speak, stop };
}
