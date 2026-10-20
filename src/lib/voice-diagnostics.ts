// Private-preview voice diagnostics. Device memory only: never saved, never
// sent, never includes words, audio, tokens or keys. Reading it costs nothing.
import { useSyncExternalStore } from "react";

export type VoiceDiagKind = "connected" | "failure" | "latency" | "interruption" | "fallback" | "ended";
export interface VoiceDiagEvent { id: number; at: number; kind: VoiceDiagKind; mode: string; detail: string; ms?: number | undefined }

const MAX = 60;
let events: VoiceDiagEvent[] = [];
let seq = 0;
const listeners = new Set<() => void>();

/** detail must be a fixed stage label or error code — never user content. */
export function recordVoiceDiag(kind: VoiceDiagKind, mode: string, detail: string, ms?: number) {
  const safe = detail.replace(/[^\w .:/()-]/g, "").slice(0, 80);
  events = [{ id: ++seq, at: Date.now(), kind, mode, detail: safe, ms: ms === undefined ? undefined : Math.max(0, Math.round(ms)) }, ...events].slice(0, MAX);
  listeners.forEach(fn => fn());
}
export function clearVoiceDiag() { events = []; listeners.forEach(fn => fn()); }
export function readVoiceDiag() { return events; }

export function summarizeVoiceDiag(list: VoiceDiagEvent[]) {
  const lat = list.filter(e => e.kind === "latency" && e.ms !== undefined).map(e => e.ms!).sort((a, b) => a - b);
  return {
    failures: list.filter(e => e.kind === "failure").length,
    interruptions: list.filter(e => e.kind === "interruption").length,
    fallbacks: list.filter(e => e.kind === "fallback").length,
    medianMs: lat.length ? lat[Math.floor(lat.length / 2)] ?? null : null,
    worstMs: lat.length ? lat[lat.length - 1] ?? null : null,
  };
}

export function useVoiceDiag() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, readVoiceDiag, readVoiceDiag);
}

/** Shown only on the private preview or local development, never on the published site. */
export function isPrivatePreview(host: string) {
  return host.startsWith("id-preview--") || host.endsWith("-dev.lovable.app") || host === "localhost" || host === "127.0.0.1";
}

const TIMING_STAGES = {
  'speech end to transcript': 'Speech end → transcript',
  'office request to answer': 'Office request → answer',
  'end of speech to first sound': 'Speech end → provider audio start',
} as const;
/** Stage and voice mode must never be pooled: a fast transcription sample is
 * not a fast end-to-end reply. Provider audio start is not hardware audibility.
 */
export function summarizeVoiceStages(list: VoiceDiagEvent[]) {
  const groups = new Map<string, { mode: string; stage: string; values: number[] }>();
  for (const event of list) {
    if (event.kind !== 'latency' || event.ms === undefined || !Number.isFinite(event.ms) || event.ms < 0) continue;
    const stage = TIMING_STAGES[event.detail as keyof typeof TIMING_STAGES];
    if (!stage) continue;
    const key = `${event.mode}:${event.detail}`;
    const group = groups.get(key) ?? { mode: event.mode, stage, values: [] };
    group.values.push(event.ms);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ mode, stage, values }) => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return { mode, stage, samples: values.length,
      medianMs: values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2,
      p95Ms: values[Math.ceil(values.length * 0.95) - 1]!,
      worstMs: values[values.length - 1]!,
    };
  });
}
