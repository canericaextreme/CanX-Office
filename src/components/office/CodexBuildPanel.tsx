import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useOwnerSession } from '@/lib/owner-session';
import { codexBuildOperation } from '@/lib/codex-builds.functions';
import type { CodexBuildResult } from '@/lib/codex-builds.server';
import { Button } from '@/components/ui/button';
export function CodexBuildPanel() {
  const session = useOwnerSession();
  const run = useServerFn(codexBuildOperation);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CodexBuildResult | null>(null);
  const act = async (submit: boolean) => {
    if (busy || !session.accessToken) return;
    setBusy(true);
    try { setResult(await run({ data: { accessToken: session.accessToken, ...(submit ? { request } : {}) } })); }
    catch { setResult({ ok: false, detail: 'Could not confirm the connection. Check status before resending a build.' }); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="Codex builds">
    <h2 className="text-lg font-semibold">Build with Data and Codex</h2>
    <p>Describe a change here or ask Data to send it to Codex. Codex prepares a draft change with test results. Claude can review the returned evidence through Data. Publishing is a separate step.</p>
    <label className="block" htmlFor="codex-build-request">What should Codex build or fix?</label>
    <textarea id="codex-build-request" className="min-h-28 w-full rounded border bg-background p-3" value={request} maxLength={6000} onChange={e => setRequest(e.target.value)} />
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy || !session.stepUpComplete || request.trim().length < 10} onClick={() => void act(true)}>Send build to Codex</Button>
      <Button variant="outline" disabled={busy || !session.stepUpComplete} onClick={() => void act(false)}>Check connection and builds</Button>
    </div>
    {!session.stepUpComplete && <p>Complete owner verification to use Codex builds.</p>}
    <p role="status">{busy ? 'Contacting the build service…' : result?.detail ?? 'Connection has not been checked.'}</p>
    {result?.runs?.map(item => <p key={item.id}><a className="underline" href={item.url} target="_blank" rel="noreferrer">Build {item.id}</a> — {item.state}. {item.title}</p>)}
  </section>;
}
