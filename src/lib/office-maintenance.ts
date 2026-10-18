/** Active-request maintenance intake. No timers, providers or authority to repair production. */
import { sha256Hex } from "./sha256";
import { ROOM_TARGETS, type RoomSnapshot, type RoomTarget } from "./room-snapshot";

export function isOfficeMaintenanceRequest(text: string): boolean {
  return /^(?:elsie[, :]*)?(?:run|do|start) (?:the )?(?:routine )?office maintenance[.!]?$/i.test(
    text.trim(),
  );
}

export interface MaintenanceFinding {
  key: string;
  room: string;
  route: string;
  source: string;
  disposition: "diagnose" | "owner-access";
  observedAt: string;
}

export interface MaintenancePlan {
  checkedAt: string;
  findings: MaintenanceFinding[];
  incompleteRooms: string[];
  // A saved-data read never proves voice, layout or deployed repairs.
  liveTested: false;
}

export function planOfficeMaintenance(
  snapshots: Map<string, RoomSnapshot | null>,
  checkedAt: string,
  buildId: string,
  targets: readonly RoomTarget[] = ROOM_TARGETS,
): MaintenancePlan {
  const findings: MaintenanceFinding[] = [];
  const incompleteRooms = new Set<string>();
  for (const target of targets) {
    if (target.reserved) continue;
    const snap = snapshots.get(target.route);
    // Never interpret stale or wrong-room evidence as a fresh fault/success.
    if (
      !snap ||
      snap.route !== target.route ||
      snap.buildId !== buildId ||
      snap.checkedAt !== checkedAt
    ) {
      incompleteRooms.add(target.label);
      continue;
    }
    for (const source of target.sources) {
      if (source.kind === "static") continue;
      const result = snap.sources.find((s) => s.key === source.key && s.kind === source.kind);
      if (
        source.kind === "device" ||
        !result ||
        result.status === "not-read" ||
        result.capped ||
        result.partial
      ) {
        if (!result || result.status !== "read" || result.capped || result.partial)
          incompleteRooms.add(target.label);
        continue;
      }
      if (result.status === "failed" || result.status === "denied") {
        findings.push({
          key: `${target.route}:${source.key}`,
          room: target.label,
          route: target.route,
          source: source.label,
          disposition: result.status === "denied" ? "owner-access" : "diagnose",
          observedAt: checkedAt,
        });
      }
    }
  }
  return { checkedAt, findings, incompleteRooms: [...incompleteRooms], liveTested: false };
}

/** Stable owner+source identity: database primary key prevents parallel duplicate inserts. */
export function maintenanceTaskId(ownerId: string, key: string): string {
  const h = sha256Hex(JSON.stringify(["canx-maintenance-v1", ownerId, key]));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
