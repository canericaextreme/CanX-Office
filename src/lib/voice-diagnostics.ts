// Private-preview voice diagnostics. Device memory only: never saved, never
// sent, never includes words, audio, tokens or keys. Reading it costs nothing.
import { useSyncExternalStore } from "react";

export type VoiceDiagKind = "connected" | "failure" | "latency" | "interruption" | "fallback" | "ended";
export interface VoiceDiagEvent { id: number; at: number; kind: VoiceDiagKind; mode: string; detail: string; ms?: number }

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
    medianMs: lat.length ? lat[Math.floor(lat.length / 2)] : null,
    worstMs: lat.length ? lat[lat.length - 1] : null,
  };
}

export function useVoiceDiag() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, readVoiceDiag, readVoiceDiag);
}

/** Shown only on the private preview or local development, never on the published site. */
export function isPrivatePreview(host: string) {
  return host.startsWith("id-preview--") || host.endsWith("-dev.lovable.app") || host === "localhost" || host === "127.0.0.1";
}
