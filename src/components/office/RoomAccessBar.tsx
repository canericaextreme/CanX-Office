import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Eye, Loader2, RefreshCw } from "lucide-react";
import { useOwnerSession } from "@/lib/owner-session";
import { collectDeviceSnapshot } from "@/lib/room-device-snapshot";
import { getRoomSnapshot } from "@/lib/room-snapshot.functions";
import { roomTargetForRoute, snapshotRef, type RoomSnapshot } from "@/lib/room-snapshot";
import { recordViewedSnapshot, ROOM_REFRESH_EVENT } from "@/lib/room-snapshot-store";
import { currentBuildVersion } from "@/lib/office-health";
import { formatRoomReadAt } from "@/lib/subscriptions";

const VISIBLE_REFRESH_MS = 90_000;
const REFRESH_EVENTS = [ROOM_REFRESH_EVENT, "canx:room-reports-changed", "canx:workbench-changed"];

const STATUS_TEXT: Record<string, string> = { read: "read", failed: "failed", denied: "needs two-step", "not-read": "device only" };
const KIND_TEXT: Record<string, string> = { live: "Live", device: "This device", static: "App setup" };

/** What Elsie and John can see for the open room, with checked time and refresh. Reads only; no AI spend. */
export function RoomAccessBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const target = roomTargetForRoute(path);
  const session = useOwnerSession();
  const fetchSnapshot = useServerFn(getRoomSnapshot);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const token = session.accessToken;

  const refresh = useCallback(async () => {
    if (!target || !token) return;
    const mine = ++seq.current;
    setBusy(true);
    try {
      const reply = await fetchSnapshot({ data: { accessToken: token, route: target.route, buildId: currentBuildVersion(), device: collectDeviceSnapshot(target.route) } });
      // A reply for a room John already left is discarded (navigation race).
      if (mine !== seq.current) return;
      if (!reply.ok) { setError(reply.message); setSnap(null); return; }
      setError("");
      setSnap(reply.snapshot);
      recordViewedSnapshot(snapshotRef(reply.snapshot));
    } catch {
      if (mine === seq.current) { setError("This room could not be checked just now."); setSnap(null); }
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [target, token, fetchSnapshot]);

  useEffect(() => {
    setSnap(null); setError("");
    void refresh();
    const onEvent = () => void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    REFRESH_EVENTS.forEach((e) => window.addEventListener(e, onEvent));
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, VISIBLE_REFRESH_MS);
    return () => {
      seq.current++;
      REFRESH_EVENTS.forEach((e) => window.removeEventListener(e, onEvent));
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (!target) return null;
  const tone = !token ? "border-border" : error || snap?.overall === "failed" ? "border-destructive/60" : snap?.overall === "partial" ? "border-amber-500/60" : snap ? "border-emerald-500/50" : "border-border";
  const headline = !token
    ? "Sign in to let Elsie read this room. Nothing is read while signed out."
    : error ? `Not checked: ${error}`
    : !snap ? "Checking this room…"
    : snap.overall === "fresh" ? `Elsie can read this room · saved room records read ${formatRoomReadAt(snap.checkedAt)}`
    : snap.overall === "partial" ? `Elsie can read part of this room · saved room records read ${formatRoomReadAt(snap.checkedAt)}`
    : `Elsie could not read this room's records · tried ${formatRoomReadAt(snap.checkedAt)}`;

  return (
    <section aria-label="Elsie's access to this room" className={`mx-auto mt-3 max-w-6xl rounded-lg border ${tone} bg-card/70 px-3 py-2 text-sm`} data-room-access={snap?.overall ?? (error ? "error" : "none")}>
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span role="status" className="font-medium text-foreground">{headline}</span>
        <div className="ml-auto flex items-center gap-1">
          {snap && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary">
              Sources <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
          )}
          <button type="button" onClick={() => void refresh()} disabled={!token || busy} aria-label="Refresh room check" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />} Refresh
          </button>
        </div>
      </div>
      {snap && open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2 text-xs">
          <ul className="grid gap-1 sm:grid-cols-2">
            {snap.sources.map((s) => (
              <li key={s.key} className="text-muted-foreground">
                <span className="font-medium text-foreground">{s.label}</span> — {KIND_TEXT[s.kind]}, {s.kind === "static" ? "app setup (not live)" : STATUS_TEXT[s.status]}
                {s.count !== null && s.kind !== "static" ? `, ${s.count}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Skills Elsie uses here: {snap.skills.ready.map((k) => k.name).join(", ") || "office-wide rules only"} (registry {snap.skills.registryVersion}).
          </p>
          <p className="text-muted-foreground">Things Elsie can actually do here: {snap.actions.map((a) => a.label).join("; ")}.</p>
          {snap.limits.length > 0 && <ul className="list-disc pl-4 text-muted-foreground">{snap.limits.map((l) => <li key={l}>{l}</li>)}</ul>}
          <p className="text-muted-foreground">Check reference {snap.fingerprint} · build {snap.buildId}. Elsie reads this room again for every question; this panel refreshes when you return to the page.</p>
        </div>
      )}
    </section>
  );
}
