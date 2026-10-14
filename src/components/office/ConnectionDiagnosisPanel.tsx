import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { diagnoseConnection, MAX_DIAGNOSIS_INPUT, type DiagnosisResult } from "@/lib/connection-diagnosis";

/** Free, rules-only. Runs on this device; nothing is sent or saved. */
export function ConnectionDiagnosisPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Diagnose a connection error</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Paste the error message and any details you have. The check runs only on this device, using built-in rules.
          No AI is used, nothing is sent anywhere and nothing is saved. Tokens, keys and email addresses are removed first.
        </p>
        <Textarea aria-label="Connection error and details" rows={5} maxLength={MAX_DIAGNOSIS_INPUT}
          value={text} onChange={e => { setText(e.target.value); setResult(null); }} />
        <div className="flex gap-2">
          <Button disabled={!text.trim()} onClick={() => setResult(diagnoseConnection(text))}>Diagnose</Button>
          <Button variant="outline" onClick={() => { setText(""); setResult(null); }}>Clear</Button>
        </div>
        {result && (
          <div className="space-y-3" role="status">
            <p className="text-sm">{result.redactionCount} sensitive item{result.redactionCount === 1 ? "" : "s"} removed.</p>
            {result.findings.length === 0 ? (
              <p>No known failure point matched. This doesn't mean the connection works. Ask Claude for a review, or report the exact message.</p>
            ) : result.findings.map(f => (
              <div key={f.id} className="rounded border p-3 space-y-1">
                <p className="font-semibold">{f.title} <span className="text-xs text-muted-foreground">({f.confidence === "known-cause" ? "known cause" : "possible cause"})</span></p>
                <p className="text-sm">{f.likelyCause}</p>
                <p className="text-xs text-muted-foreground break-all">Matched: “{f.evidence}”</p>
                <ul className="list-disc pl-5 text-sm">{f.nextSteps.map(s => <li key={s}>{s}</li>)}</ul>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">These are suggestions only. A connection is confirmed only after a real sign-in, a saved room read and a room picture all succeed.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
