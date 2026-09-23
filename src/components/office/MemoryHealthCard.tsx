import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAstraMemoryHealth } from "@/lib/astra-memory-health.functions";
import type { MemoryHealth } from "@/lib/astra-continuity";

/** Plain-language memory status. The check costs no AI credits. */
export function MemoryHealthCard({ accessToken }: { accessToken: string }) {
  const check = useServerFn(getAstraMemoryHealth);
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setHealth(await check({ data: { accessToken } })); }
    catch { setHealth({ state: "degraded", reason: "The check could not reach the server.", checkedAt: new Date().toISOString() }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Astra memory</p>
      <p role="status" className="mt-1.5 text-sm font-semibold text-foreground">
        {health ? (health.state === "connected" ? "Memory connected" : "Memory degraded") : "Not checked yet"}
      </p>
      {health && <p className="text-[11px] text-muted-foreground">{health.reason} Checked {new Date(health.checkedAt).toLocaleString()}.</p>}
      <button type="button" onClick={() => void run()} disabled={busy || !accessToken}
        className="mt-2 min-h-11 rounded-md border border-border px-3 text-sm disabled:opacity-50">
        {busy ? "Checking…" : "Check memory"}
      </button>
      <p className="mt-1 text-[11px] text-muted-foreground">This check uses no AI credits.</p>
    </div>
  );
}
