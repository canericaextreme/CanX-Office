import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { getRoomSnapshot } from "@/lib/room-snapshot.functions";
import { deleteSharedNote, saveSharedNotes } from "@/lib/records.functions";
import { ROOM_TARGETS, type RoomSnapshot } from "@/lib/room-snapshot";
import { viewedSnapshot } from "@/lib/room-snapshot-store";
import { roomReportSource } from "@/lib/manager-room-commands";
import { currentBuildVersion } from "@/lib/office-health";
import { evaluateSnapshot, failedRecord, loadRoomChecks, saveRoomChecks, statusForBuild, type RoomCheckRecord } from "@/lib/room-connection-check";

const BADGE: Record<string, string> = {
  verified: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
  untested: "text-muted-foreground",
};
const LABEL: Record<string, string> = { verified: "Verified", partial: "Partly verified", failed: "Failed", untested: "Not tested on this build" };

/**
 * Owner-run check of every room Elsie can read. Read-only by default; the
 * optional save test writes one temporary room report per room, re-reads it,
 * removes it and re-reads again. No AI call, no spend.
 */
export function RoomConnectionCheck() {
  const session = useOwnerSession();
  const snapshotFn = useServerFn(getRoomSnapshot);
  const saveFn = useServerFn(saveSharedNotes);
  const deleteFn = useServerFn(deleteSharedNote);
  const [records, setRecords] = useState<Record<string, RoomCheckRecord>>(() => (typeof window === "undefined" ? {} : loadRoomChecks()));
  const [running, setRunning] = useState<string | null>(null);
  const buildId = currentBuildVersion();
  const token = session.accessToken;

  const read = async (route: string): Promise<RoomSnapshot | string> => {
    const reply = await snapshotFn({ data: { accessToken: token ?? "", route, buildId } }).catch(() => null);
    if (!reply) return "Room check request failed.";
    return reply.ok ? reply.snapshot : reply.message;
  };

  const saveTest = async (snap: RoomSnapshot): Promise<RoomCheckRecord["action"]> => {
    const before = snap.sources.find((s) => s.key === "reports");
    if (!before || before.status !== "read") return { ran: true, ok: false, detail: "Room reports could not be read before the test." };
    const id = crypto.randomUUID();
    const title = `Connection check ${new Date().toISOString()} (temporary)`;
    const saved = await saveFn({ data: { accessToken: token ?? "", notes: [{ id, kind: "decision", title, detail: "Temporary owner-run connection check; removed automatically.", owner: "John", provenance: "john", source: roomReportSource(snap.roomId), createdAt: new Date().toISOString() }] } }).catch(() => null);
    if (!saved?.ok || saved.data?.saved !== 1) return { ran: true, ok: false, detail: "Temporary report was not saved." };
    const afterSave = await read(snap.route);
    const seen = typeof afterSave !== "string" && afterSave.sources.some((s) => s.key === "reports" && s.status === "read" && s.count === (before.count ?? 0) + 1 && s.items.includes(title));
    const removed = await deleteFn({ data: { accessToken: token ?? "", id } }).catch(() => null);
    const afterDelete = await read(snap.route);
    const gone = typeof afterDelete !== "string" && afterDelete.sources.some((s) => s.key === "reports" && s.status === "read" && s.count === (before.count ?? 0) && !s.items.includes(title));
    if (!seen) return { ran: true, ok: false, detail: removed?.ok ? "Saved but not seen on re-read; temporary report removed." : "Saved but not seen on re-read, and removal was not confirmed — check Records." };
    if (!removed?.ok || !gone) return { ran: true, ok: false, detail: "Seen on re-read, but removal was not confirmed — check Records for a 'Connection check' report." };
    return { ran: true, ok: true, detail: "Saved, re-read, removed and re-read." };
  };

  const run = async (withSaveTest: boolean) => {
    if (!token || running) return;
    const next = { ...records };
    for (const target of ROOM_TARGETS) {
      setRunning(target.label);
      const snap = await read(target.route);
      if (typeof snap === "string") { next[target.route] = failedRecord(target.route, target.label, buildId, snap); continue; }
      const action = withSaveTest && target.route !== "/future" ? await saveTest(snap) : undefined;
      next[target.route] = evaluateSnapshot(snap, action);
      setRecords({ ...next });
    }
    saveRoomChecks(next);
    setRecords(next);
    setRunning(null);
  };

  const counts = ROOM_TARGETS.reduce((acc, t) => { const s = statusForBuild(records[t.route], buildId); acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Partial<Record<"verified" | "partial" | "failed" | "untested", number>>);

  return (
    <section aria-label="Elsie room connection check" className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Elsie's room connections — owner check</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Checks every room Elsie can read ({ROOM_TARGETS.filter((t) => t.number).length} numbered rooms plus {ROOM_TARGETS.filter((t) => !t.number).length} other destinations) on this build ({buildId}). Only a signed-in run counts; automated test fixtures never do. No AI call is made.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!token || !!running} onClick={() => void run(false)}>Check all rooms (read only)</Button>
        <Button size="sm" variant="outline" disabled={!token || !!running} onClick={() => void run(true)}>Check all rooms + reversible save test</Button>
      </div>
      {!token && <p className="mt-2 text-xs text-muted-foreground">Sign in as the owner to run this check.</p>}
      {running && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking {running}…</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        This build: {counts.verified ?? 0} verified · {counts.partial ?? 0} partly verified · {counts.failed ?? 0} failed · {counts.untested ?? 0} not tested. The save test adds one temporary report per room and removes it.
      </p>
      <ul className="mt-3 space-y-1.5">
        {ROOM_TARGETS.map((t) => {
          const rec = records[t.route];
          const status = statusForBuild(rec, buildId);
          const view = viewedSnapshot(t.route);
          return (
            <li key={t.route} className="rounded-md border border-border/70 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{t.number ? `${t.number} · ` : ""}{t.label}</span>
                <span className={`ml-auto font-semibold ${BADGE[status]}`}>{LABEL[status]}</span>
              </div>
              {rec && status !== "untested" && (
                <div className="mt-1 space-y-0.5 text-muted-foreground">
                  <p>Checked {new Date(rec.checkedAt).toLocaleString()} · reference {rec.fingerprint ?? "none"}{view ? ` · your room view ${view.fingerprint === rec.fingerprint ? "matched" : `showed ${view.fingerprint}`}` : " · room not opened this visit"}</p>
                  {rec.sourcesRead.length > 0 && <p>Read: {rec.sourcesRead.join(", ")}</p>}
                  <p>Skill routing: {rec.skillRouteOk === null ? "not checked" : rec.skillRouteOk ? "matches" : "differs"} · Save test: {rec.action.ran ? rec.action.detail : "not run"}</p>
                  {rec.failure && <p className="text-destructive">{rec.failure}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
