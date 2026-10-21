import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearVoiceDiag, isPrivatePreview, summarizeVoiceDiag, summarizeVoiceStages, useVoiceDiag } from "@/lib/voice-diagnostics";

const LABEL = { connected: "Connected", failure: "Failure", latency: "Reply delay", interruption: "Interruption", fallback: "Fallback", ended: "Ended" } as const;

export function VoiceDiagnosticsPanel() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => setAllowed(isPrivatePreview(window.location.hostname)), []);
  const events = useVoiceDiag();
  if (!allowed) return null;
  const s = summarizeVoiceDiag(events);
  const stages = summarizeVoiceStages(events);
  return (
    <details className="w-full rounded-md border border-border p-2 text-xs">
      <summary className="cursor-pointer py-1 font-medium">Voice diagnostics (private preview)</summary>
      <p className="mt-1 text-muted-foreground">This device only, this session only. No words, audio or keys are kept. Nothing here changes budgets or permissions.</p>
      <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Failures</dt><dd className="text-base font-semibold">{s.failures}</dd></div>
        <div><dt className="text-muted-foreground">Interruptions</dt><dd className="text-base font-semibold">{s.interruptions}</dd></div>
        <div><dt className="text-muted-foreground">Fallbacks</dt><dd className="text-base font-semibold">{s.fallbacks}</dd></div>
      </dl>
      {stages.length > 0 && <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left" aria-label="Voice timing by stage and mode">
          <caption className="text-left text-muted-foreground">Provider audio start does not confirm that sound reached the device speaker. Clear between warm and cold test sessions.</caption>
          <thead><tr><th>Mode / stage</th><th>Samples</th><th>Median</th><th>p95</th></tr></thead>
          <tbody>{stages.map(row => <tr key={`${row.mode}:${row.stage}`}>
            <th className="pr-2 font-normal">{row.mode === "direct" ? "Live" : row.mode === "fallback" ? "Record-and-reply" : "Standard"} · {row.stage}</th>
            <td>{row.samples}</td><td>{(row.medianMs / 1000).toFixed(2)}s</td><td>{(row.p95Ms / 1000).toFixed(2)}s</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {events.length === 0 ? <p className="mt-2 text-muted-foreground">No voice events yet. Start a conversation to record some.</p> : (
        <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {events.map(e => (
            <li key={e.id} className={e.kind === "failure" ? "text-destructive" : ""}>
              {new Date(e.at).toLocaleTimeString()} · {LABEL[e.kind]} · {e.mode === "direct" ? "Live" : e.mode === "fallback" ? "Record-and-reply" : "Standard"} · {e.detail}{e.ms !== undefined ? ` · ${(e.ms / 1000).toFixed(1)}s` : ""}
            </li>
          ))}
        </ol>
      )}
      {events.length > 0 && <Button type="button" size="sm" variant="outline" className="mt-2 h-9" onClick={clearVoiceDiag}>Clear</Button>}
    </details>
  );
}
