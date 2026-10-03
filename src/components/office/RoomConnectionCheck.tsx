import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { checkRoomReportPresence, getRoomSnapshot } from "@/lib/room-snapshot.functions";
import { collectDeviceSnapshot } from "@/lib/room-device-snapshot";
import { deleteSharedNote, saveSharedNotes } from "@/lib/records.functions";
import { ROOM_TARGETS, MAP_ROOM_TARGETS, NUMBERED_ROOM_TARGETS, type RoomSnapshot } from "@/lib/room-snapshot";
import { viewedSnapshot } from "@/lib/room-snapshot-store";
import { roomReportSource } from "@/lib/manager-room-commands";
import { currentBuildVersion } from "@/lib/office-health";
import { evaluateSnapshot, failedRecord, runReportSaveTest, loadRoomChecks, saveRoomChecks, statusForBuild, type RoomCheckRecord } from "@/lib/room-connection-check";

const BADGE: Record<string, string> = {
  verified: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
  untested: "text-muted-foreground",
};
const LABEL: Record<string, string> = { verified: "Fully verified", partial: "Partly verified", failed: "Failed", untested: "Not tested on this build", reserved: "Reserved — no sources" };

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
  const presenceFn = useServerFn(checkRoomReportPresence);
  const [records, setRecords] = useState<Record<string, RoomCheckRecord>>(() => (typeof window === "undefined" ? {} : loadRoomChecks()));
  const [running, setRunning] = useState<string | null>(null);
  const buildId = currentBuildVersion();
  const token = session.stepUpComplete ? session.accessToken : null;

  const read = async (route: string): Promise<RoomSnapshot | string> => {
    const reply = await snapshotFn({ data: { accessToken: token ?? "", route, buildId, device: collectDeviceSnapshot(route) } }).catch(() => null);
    if (!reply) return "Room check request failed.";
    return reply.ok ? reply.snapshot : reply.message;
  };

  const saveTest = async (snap: RoomSnapshot): Promise<RoomCheckRecord["action"]> => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = `[TEST] Room connection check ${now} — temporary, auto-removed`;
    return runReportSaveTest({
      save: async () => {
        const saved = await saveFn({ data: { accessToken: token ?? "", notes: [{ id, kind: "decision", title, detail: "TEST RECORD from the owner-run room connection check in Build & Testing. Not a real report; it is deleted right after being re-read. If you see it, the removal failed — it is safe to delete.", owner: "John", provenance: "john", source: roomReportSource(snap.roomId), createdAt: now }] } });
        return !!saved?.ok && saved.data?.saved === 1;
      },
      presence: async () => (await presenceFn({ data: { accessToken: token ?? "", route: snap.route, id } })).presence,
      remove: async () => !!(await deleteFn({ data: { accessToken: token ?? "", id } }))?.ok,
    });
  };

  const run = async (withSaveTest: boolean) => {
    if (!token || running) return;
    const next = { ...records };
    for (const target of ROOM_TARGETS) {
      setRunning(target.label);
      const snap = await read(target.route);
      if (typeof snap === "string") { next[target.route] = failedRecord(target.route, target.label, buildId, snap); continue; }
      const action = withSaveTest && !target.reserved ? await saveTest(snap) : undefined;
      next[target.route] = evaluateSnapshot(snap, action);
      setRecords({ ...next });
    }
    saveRoomChecks(next);
    setRecords(next);
    setRunning(null);
  };

  const counts = ROOM_TARGETS.reduce((acc, t) => { const s = statusForBuild(records[t.route], buildId); acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Partial<Record<"verified" | "partial" | "failed" | "untested" | "reserved", number>>);

  return (
    <section aria-label="Elsie room connection check" className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Elsie's room connections — owner check</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Checks every room Elsie can read (all {MAP_ROOM_TARGETS.length} rooms on the office map — {NUMBERED_ROOM_TARGETS.length} working rooms plus reserved Future #20 — and {ROOM_TARGETS.length - MAP_ROOM_TARGETS.length} other pages) on this build ({buildId}). Only a signed-in run counts; automated test fixtures never do. No AI call is made.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={!token || !!running} onClick={() => void run(false)}>Check all rooms (read only)</Button>
        <Button size="sm" variant="outline" disabled={!token || !!running} onClick={() => void run(true)}>Check all rooms + reversible save test</Button>
      </div>
      {!token && <p className="mt-2 text-xs text-muted-foreground">Sign in as the owner with your authenticator code to run this check. Nothing has been checked on this build until you do.</p>}
      {running && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking {running}…</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        This build: {counts.verified ?? 0} fully verified (every database and device source read) · {counts.partial ?? 0} partly verified · {counts.failed ?? 0} failed · {counts.untested ?? 0} not tested · {counts.reserved ?? 0} reserved.{buildId === "unknown" ? " This build's version can't be identified here, so no room can be fully verified." : ""} The save test adds one labelled [TEST] report per working room, re-reads it and deletes it; Future is read only.
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
                  {rec.sharedReaderOk !== undefined && <p>Shared reader: {rec.sharedReaderOk ? "every database source read" : "some database sources not read"} · Room coverage: {rec.coverage === "full" ? "all sources" : rec.coverage === "reserved" ? "reserved room" : "partial"}</p>}
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
