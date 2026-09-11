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
  /** Called the moment any speech is heard — used for barge-in. */
  onSpeechStart?: (text: string) => void;
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
  /** True while the caller wants the microphone open, so short drop-outs restart. */
  const wantListening = useRef(false);
  const startRef = useRef<() => void>(() => undefined);
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
    wantListening.current = false;
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
    wantListening.current = true;
    // Detach and drop any previous session first: two live recognisers fight
    // over the microphone, which is the usual cause of speech dropping out.
    const previous = recRef.current;
    if (previous) {
      previous.onresult = null;
      previous.onerror = null;
      previous.onend = null;
      recRef.current = null;
      try {
        previous.abort();
      } catch {
        /* already finished */
      }
    }
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
        // Barge-in: pass the words along so the caller can judge whether this is
        // really the speaker talking, rather than the Manager's own voice.
        const heard = (finalText || live).trim();
        if (heard) optionsRef.current.onSpeechStart?.(heard);
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
        // A silent moment or an internal restart is normal — keep the mic open.
        if (code === "no-speech" || code === "aborted" || code === "network") return;
        wantListening.current = false;
        setError(
          code === "not-allowed" || code === "service-not-allowed"
            ? "Microphone access was refused, so nothing was heard. Allow the microphone in your browser and press Talk again."
            : "Voice input stopped unexpectedly. You can type your message instead.",
        );
        setListening(false);
      };
      rec.onend = () => {
        setInterim("");
        // Browsers end recognition on their own after a pause. If the caller
        // still wants to listen, start it again quickly so speech is not lost.
        if (wantListening.current) {
          setTimeout(() => {
            if (wantListening.current) startRef.current();
          }, 80);
          return;
        }
        setListening(false);
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      // An "already started" error just means the microphone is still open.
      setListening(wantListening.current);
    }
  }, []);
  startRef.current = start;

  return { supported, listening, interim, error, start, stop };
}

/* ----------------------------- speaking aloud ----------------------------- */

/**
 * Choose the most natural-sounding English voice the browser offers. Modern
 * browsers ship "Natural"/"Neural" voices that sound conversational; the plain
 * default is only used when nothing better exists.
 */
export function pickNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => /^en(-|$)/i.test(voice.lang || ""));
  const pool = english.length ? english : voices;
  if (!pool.length) return null;
  const preferred = [
    /natural/i,
    /neural/i,
    /google (uk|us) english/i,
    /\b(samantha|aria|jenny|libby|sonia|ava|allison|serena)\b/i,
    /google/i,
  ];
  for (const pattern of preferred) {
    const match = pool.find((voice) => pattern.test(voice.name || ""));
    if (match) return match;
  }
  return pool[0] ?? null;
}

/** Split into speakable chunks so pauses fall at sentence ends, not mid-thought. */
export function speechChunks(text: string, maxLength = 220): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if ((current + " " + piece).trim().length <= maxLength) {
      current = (current ? `${current} ` : "") + piece;
    } else {
      if (current) chunks.push(current);
      current = piece.length > maxLength * 2 ? piece.slice(0, maxLength * 2) : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface ReadAloudState {
  supported: boolean;
  /** True once the browser actually offers at least one usable voice. */
  hasVoice: boolean;
  speakingId: string | null;
  speak: (id: string, text: string, onDone?: () => void) => void;
  stop: () => void;
  /**
   * Called inside a real button press. Browsers only allow speech after a user
   * gesture, so this wakes the speech engine and reloads the voice list.
   * Returns false when the browser has no usable voice at all.
   */
  unlock: () => boolean;
}

/** Speaks only when asked to — by a button press, or by Voice Mode being on. */
export function useReadAloud(): ReadAloudState {
  const [supported, setSupported] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const has = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(has);
    if (!has) return;
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current = pickNaturalVoice(voices);
      setHasVoice(voices.length > 0);
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const unlock = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    try {
      window.speechSynthesis.resume();
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        voiceRef.current = pickNaturalVoice(voices);
        setHasVoice(true);
      }
      // A silent utterance inside the click gesture wakes engines that
      // otherwise ignore the first real sentence.
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
      return voices.length > 0;
    } catch {
      return false;
    }
  }, []);

  const keepAlive = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearKeepAlive = useCallback(() => {
    if (keepAlive.current) clearInterval(keepAlive.current);
    keepAlive.current = null;
  }, []);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    clearKeepAlive();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [clearKeepAlive]);

  const speak = useCallback(
    (id: string, text: string, onDone?: () => void) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        onDone?.();
        return;
      }
      window.speechSynthesis.cancel();
      cancelledRef.current = false;
      // Shorter pieces: some browsers silently stop long utterances part-way.
      const chunks = speechChunks(text.slice(0, 4000), 150);
      if (!chunks.length) {
        onDone?.();
        return;
      }
      setSpeakingId(id);

      // Chrome quietly pauses long speech. Only resume when it is actually
      // paused — pausing it ourselves is what used to make the voice drop out.
      clearKeepAlive();
      keepAlive.current = setInterval(() => {
        if (cancelledRef.current) return;
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 4000);

      const finish = () => {
        clearKeepAlive();
        setSpeakingId(null);
        onDone?.();
      };

      const speakChunk = (index: number) => {
        if (cancelledRef.current) {
          clearKeepAlive();
          return;
        }
        if (index >= chunks.length) {
          finish();
          return;
        }
        const piece = chunks[index]!;
        const utterance = new SpeechSynthesisUtterance(piece);
        if (voiceRef.current) {
          utterance.voice = voiceRef.current;
          utterance.lang = voiceRef.current.lang;
        }
        // Relaxed, conversational delivery rather than the flat default.
        utterance.rate = 1.02;
        utterance.pitch = 1.02;
        utterance.volume = 1;
        let moved = false;
        let guard: ReturnType<typeof setTimeout> | null = null;
        const next = () => {
          if (guard) clearTimeout(guard);
          guard = null;
          if (moved || cancelledRef.current) return;
          moved = true;
          speakChunk(index + 1);
        };
        utterance.onend = next;
        // If a piece is dropped by the browser, carry on instead of stopping.
        utterance.onerror = next;
        window.speechSynthesis.speak(utterance);
        // Safety net: if the browser never reports the piece as finished,
        // carry on anyway so the rest of the answer is still spoken.
        guard = setTimeout(
          () => {
            if (cancelledRef.current || moved) return;
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
              guard = setTimeout(() => next(), 4000);
              return;
            }
            next();
          },
          Math.round(piece.length * 90) + 4000,
        );
      };

      // Chrome drops the first utterance when it is queued in the same tick as
      // cancel(), so give it a moment before starting.
      setTimeout(() => speakChunk(0), 90);
    },
    [clearKeepAlive],
  );

  return { supported, hasVoice, speakingId, speak, stop, unlock };
}
