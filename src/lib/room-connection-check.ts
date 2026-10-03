/**
 * Owner-run room connection check — pure evaluation and local storage.
 *
 * A room is "verified" only when, signed in, on the current build: its fresh
 * snapshot came back with every live source read, the skills it advertises
 * equal the deterministic router's choice for that room, and (when run) the
 * reversible save test was saved, re-read, removed and re-read again.
 * Fixture tests never count; a room not yet run stays "untested".
 */
import { routeSkillsForRoom } from "./office-skills";
import type { RoomSnapshot } from "./room-snapshot";

export type RoomCheckStatus = "untested" | "verified" | "partial" | "failed";
export type RoomCheckScope = "signed-in-live" | "fixture";

export interface RoomCheckRecord {
  route: string;
  label: string;
  scope: RoomCheckScope;
  status: RoomCheckStatus;
  checkedAt: string;
  buildId: string;
  fingerprint: string | null;
  sourcesRead: string[];
  sourcesNotRead: string[];
  skillRouteOk: boolean | null;
  action: { ran: boolean; ok: boolean | null; detail: string };
  failure: string;
}

/** The router's room skills (minus the always-on pair) must equal what the snapshot advertises. */
export function skillRouteMatches(snapshot: RoomSnapshot): boolean {
  const routed = routeSkillsForRoom("", snapshot.route).skills.map((s) => s.id);
  const always = routeSkillsForRoom("", null).skills.map((s) => s.id);
  const expected = snapshot.skills.ready.map((s) => s.id).filter((id) => !always.includes(id)).slice(0, 3);
  const got = routed.filter((id) => !always.includes(id));
  return expected.length === got.length && expected.every((id) => got.includes(id));
}

export function evaluateSnapshot(
  snapshot: RoomSnapshot,
  action: RoomCheckRecord["action"] = { ran: false, ok: null, detail: "Reversible save test not run." },
): RoomCheckRecord {
  const liveSources = snapshot.sources.filter((s) => s.kind === "live");
  const read = liveSources.filter((s) => s.status === "read").map((s) => s.label);
  const notRead = liveSources.filter((s) => s.status !== "read").map((s) => `${s.label} (${s.status})`);
  const skillRouteOk = skillRouteMatches(snapshot);
  const failures = [
    ...(notRead.length ? [`Not read: ${notRead.join(", ")}`] : []),
    ...(skillRouteOk ? [] : ["Skill routing differs from the room's advertised skills"]),
    ...(action.ran && action.ok === false ? [`Save test: ${action.detail}`] : []),
  ];
  const status: RoomCheckStatus =
    snapshot.overall === "failed" || (action.ran && action.ok === false) || !skillRouteOk ? "failed"
    : notRead.length || !action.ran ? "partial"
    : "verified";
  return {
    route: snapshot.route,
    label: snapshot.label,
    scope: "signed-in-live",
    status,
    checkedAt: snapshot.checkedAt,
    buildId: snapshot.buildId,
    fingerprint: snapshot.fingerprint,
    sourcesRead: read,
    sourcesNotRead: notRead,
    skillRouteOk,
    action,
    failure: failures.join("; "),
  };
}

export function failedRecord(route: string, label: string, buildId: string, failure: string, now = new Date()): RoomCheckRecord {
  return { route, label, scope: "signed-in-live", status: "failed", checkedAt: now.toISOString(), buildId, fingerprint: null, sourcesRead: [], sourcesNotRead: [], skillRouteOk: null, action: { ran: false, ok: null, detail: "" }, failure };
}

/** Results for an older build do not count for this one. */
export function statusForBuild(record: RoomCheckRecord | undefined, buildId: string): RoomCheckStatus {
  if (!record || record.scope !== "signed-in-live" || record.buildId !== buildId) return "untested";
  return record.status;
}

const STORE = "canx-room-connection-checks-v1";
export function loadRoomChecks(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): Record<string, RoomCheckRecord> {
  try {
    const v = JSON.parse(storage?.getItem(STORE) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, RoomCheckRecord>) : {};
  } catch { return {}; }
}
export function saveRoomChecks(all: Record<string, RoomCheckRecord>, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  try { storage?.setItem(STORE, JSON.stringify(all)); } catch { /* storage full or blocked: results stay on screen only */ }
}
