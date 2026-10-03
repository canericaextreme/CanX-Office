import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HEALTH_SCHEDULE, POST_PUBLISH_ROOM_CHECKS, currentBuildVersion, evaluateReleaseGate,
  loadResults, saveResult, type CheckResult, type CheckStatus,
} from "@/lib/office-health";

export function OfficeHealthPanel() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [version, setVersion] = useState("unknown");
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { setResults(loadResults()); setVersion(currentBuildVersion()); }, []);
  const gate = evaluateReleaseGate(results, version);
  const latest = (id: string) => results.filter((r) => r.checkId === id && r.version === version && r.scope === "signed-in-live").at(-1);
  const record = (checkId: string, status: CheckStatus) =>
    setResults(saveResult({ checkId, scope: "signed-in-live", status, at: new Date().toISOString(), version, note: notes[checkId]?.slice(0, 300) || undefined }));

  return (
    <Card className="border-border bg-card">
      <CardHeader><CardTitle className="text-base">Office Health — after-update room check</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p role="status" aria-live="polite" className={`rounded-lg border p-3 font-medium ${gate.state === "verified" ? "border-primary" : gate.state === "failed" ? "border-destructive text-destructive" : "border-border"}`}>
          {gate.state === "verified" ? "Verified: " : gate.state === "failed" ? "Failed: " : "Untested: "}{gate.label}
        </p>
        <p className="text-sm text-muted-foreground">Version checked: {version}. A working sign-in page or database connection alone never counts as healthy. Results are saved on this device only.</p>
        <p className="text-sm text-muted-foreground">{HEALTH_SCHEDULE.label} {HEALTH_SCHEDULE.reason}</p>
        <ol className="space-y-3">
          {POST_PUBLISH_ROOM_CHECKS.map((c) => {
            const r = latest(c.id);
            return (
              <li key={c.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{c.room} — with {c.populatedWith}</span>
                  <span className="text-sm">{r ? `${r.status === "verified" ? "Verified" : "Failed"} ${new Date(r.at).toLocaleString()}` : "Untested on this version"}</span>
                </div>
                <p className="text-sm text-muted-foreground">Check: {c.mustSee}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><Link to={c.path}>Open {c.room}</Link></Button>
                  <input aria-label={`Note for ${c.room}`} className="min-w-40 flex-1 rounded border bg-background p-2 text-sm" placeholder="What you saw (optional)" value={notes[c.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
                  <Button size="sm" onClick={() => record(c.id, "verified")}>It loaded correctly</Button>
                  <Button size="sm" variant="destructive" onClick={() => record(c.id, "failed")}>It failed</Button>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
