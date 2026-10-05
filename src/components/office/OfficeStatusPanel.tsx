import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOfficeStatus } from "@/lib/office-status.functions";
import { useOwnerSession } from "@/lib/owner-session";
import type { OfficeStatus } from "@/lib/office-status";
import { Button } from "@/components/ui/button";

export function OfficeStatusView({ status }: { status: OfficeStatus }) {
  return <div className="space-y-3 text-sm">
    <p role="status">{status.complete ? "Listed sources read." : "Some sources are incomplete or unavailable."} Checked {status.checkedAt}.</p>
    <p>{status.privacy}</p>
    <h3 className="font-semibold">Projects ({status.projects.length})</h3>
    {status.projects.length ? <ul className="list-disc pl-5">{status.projects.map(p => <li key={p.id}>{p.name} — {p.stage}. {p.stageBasis}</li>)}</ul> : <p>{status.sources[0]?.state === "read" ? "No projects were found in the readable saved register." : "The project register could not be read."}</p>}
    <h3 className="font-semibold">Latest shared log</h3>
    <ul className="list-disc pl-5">{status.sharedLog.slice(0, 10).map(e => <li key={e.id}>{e.at} · {e.actor} · {e.kind}: {e.summary}</li>)}</ul>
    <h3 className="font-semibold">Open tasks ({status.openTasks.length})</h3>
    <p>Task IDs and states only; private task text is withheld.</p>
    <ul className="list-disc pl-5">{status.openTasks.map(t => <li key={t.id}>{t.id} — {t.status}{t.projectId ? ` · project ${t.projectId}` : " · project not linked to the readable register"}</li>)}</ul>
    <h3 className="font-semibold">Known problems</h3>
    <ul className="list-disc pl-5">{status.knownProblems.map((p, i) => <li key={i}>{p}</li>)}</ul>
    <h3 className="font-semibold">Connections</h3>
    <ul className="list-disc pl-5">{status.tools.map(t => <li key={t.name}>{t.name} — {t.state}. {t.detail}</li>)}</ul>
    <details><summary>View portable status JSON</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border p-3">{JSON.stringify(status, null, 2)}</pre></details>
  </div>;
}
export function OfficeStatusPanel() {
  const session = useOwnerSession();
  const read = useServerFn(getOfficeStatus);
  const [status, setStatus] = useState<OfficeStatus | null>(null);
  const [message, setMessage] = useState("Not read yet. This check does not contact Claude or start a build.");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStatus(null); setMessage("Not read yet. This check does not contact Claude or start a build."); }, [session.accessToken]);
  async function refresh() {
    if (busy || !session.accessToken) return;
    setBusy(true); setStatus(null);
    try {
      const r = await read({ data: { accessToken: session.accessToken } });
      if (r.ok) { setStatus(r.status); setMessage("Office status read."); }
      else setMessage(r.message);
    } catch { setMessage("Office status could not be read. No data was changed."); }
    finally { setBusy(false); }
  }
  return <details className="rounded border p-3">
    <summary className="cursor-pointer font-medium">Shared Office status — Stage 1</summary>
    <div className="mt-3 space-y-3">
      <Button variant="outline" disabled={busy || !session.accessToken} onClick={() => void refresh()}>{busy ? "Reading Office status…" : "Read Office status"}</Button>
      <p role="status">{message}</p>
      {status && session.accessToken && <OfficeStatusView status={status} />}
    </div>
  </details>;
}
