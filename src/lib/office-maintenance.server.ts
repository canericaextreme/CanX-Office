import type { OwnerVerification } from "./canx-backend.server";
import { ROOM_TARGETS, type RoomSnapshot } from "./room-snapshot";
import {
  maintenanceTaskId,
  planOfficeMaintenance,
  type MaintenanceFinding,
  type MaintenancePlan,
} from "./office-maintenance";

interface IntakeTask {
  id: string;
  owner_id: string;
  evidence: string;
  status: string;
  worker: string;
  title: string;
  detail: string;
  risk: string;
}
type Row = Record<string, unknown>;
export interface MaintenanceDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  snapshots: (
    token: string,
    buildId: string,
    checkedAt: string,
  ) => Promise<Map<string, RoomSnapshot | null>>;
  rest: (
    token: string,
    path: string,
    init?: RequestInit,
  ) => Promise<{ ok: boolean; body: unknown }>;
  now: () => string;
}
export type MaintenanceResult =
  | { ok: false; message: string }
  | {
      ok: true;
      plan: MaintenancePlan;
      tracked: string[];
      unresolved: string[];
      message: string;
    };

function matches(
  row: IntakeTask | undefined,
  ownerId: string,
  finding: MaintenanceFinding,
): boolean {
  if (!row || row.owner_id !== ownerId || row.id !== maintenanceTaskId(ownerId, finding.key))
    return false;
  try {
    const e = JSON.parse(row.evidence) as Row;
    return e["kind"] === "canx-maintenance-v1" && e["key"] === finding.key;
  } catch {
    return false;
  }
}

/** Inserts diagnostic work only. Never edits, archives, completes or dispatches a task. */
export async function runOfficeMaintenanceWith(
  deps: MaintenanceDeps,
  token: string,
  buildId: string,
): Promise<MaintenanceResult> {
  const owner = await deps.verifyOwner(token);
  if (!owner.ok) return { ok: false, message: owner.message };
  if (!buildId || buildId === "unknown")
    return { ok: false, message: "The current build is unknown; maintenance was not run." };
  const checkedAt = deps.now();
  let snapshots: Map<string, RoomSnapshot | null>;
  try {
    snapshots = await deps.snapshots(token, buildId, checkedAt);
  } catch {
    return { ok: false, message: "Room checks failed; no maintenance tasks were written." };
  }
  const plan = planOfficeMaintenance(snapshots, checkedAt, buildId);
  const tracked: string[] = [],
    unresolved: string[] = [];
  for (const finding of plan.findings.filter((f) => f.disposition === "diagnose")) {
    const id = maintenanceTaskId(owner.userId, finding.key);
    const path = `manager_tasks?select=id,owner_id,evidence,status,worker,title,detail,risk&id=eq.${id}&owner_id=eq.${encodeURIComponent(owner.userId)}&limit=1`;
    const read = async () => {
      const response = await deps.rest(token, path).catch(() => null);
      return response?.ok && Array.isArray(response.body) ? (response.body as IntakeTask[]) : null;
    };
    let rows = await read();
    // An unreadable task list is not an empty list.
    if (!rows) {
      unresolved.push(finding.key);
      continue;
    }
    if (!rows.length) {
      const row = {
        id,
        owner_id: owner.userId,
        title: `Diagnose ${finding.room} read failure`.slice(0, 300),
        detail: `A fresh saved-data read failed for ${finding.source} at ${checkedAt}. Elsie owns diagnosis and follow-through. Record the cause, repair proposal and fresh verification evidence. This is an intake task, not a builder submission or permission to deploy.`,
        worker: "Elsie",
        status: "open",
        risk: "green",
        result: "",
        evidence: JSON.stringify({
          kind: "canx-maintenance-v1",
          key: finding.key,
          observedAt: checkedAt,
          buildId,
        }),
      };
      // A lost POST response may still have committed. Read the SAME id; never retry the write.
      await deps
        .rest(token, "manager_tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(row),
        })
        .catch(() => null);
      rows = await read();
      const back = rows?.[0];
      if (
        !back ||
        back.title !== row.title ||
        back.detail !== row.detail ||
        back.worker !== row.worker ||
        back.risk !== row.risk
      ) {
        unresolved.push(finding.key);
        continue;
      }
    }
    const row = rows?.[0];
    if (
      !matches(row, owner.userId, finding) ||
      !["open", "in_progress", "waiting"].includes(row!.status)
    ) {
      // Closed/changed records stay intact, including Claude's cleanup work.
      unresolved.push(finding.key);
    } else tracked.push(id);
  }
  const ownerAccess = plan.findings.filter((f) => f.disposition === "owner-access");
  const message = [
    `Maintenance intake: ${tracked.length} open diagnostic task(s) confirmed by readback. New tasks are assigned to Elsie; existing assignments are preserved. Assignment is not execution.`,
    ownerAccess.length
      ? `Owner access needs attention in: ${[...new Set(ownerAccess.map((f) => f.room))].join(", ")}. Access was not changed.`
      : "No owner-access denial was observed in the readable checks.",
    unresolved.length
      ? `${unresolved.length} task(s) could not be confirmed open; existing records were preserved.`
      : "",
    plan.incompleteRooms.length
      ? `${plan.incompleteRooms.length} room(s) have incomplete coverage; unknown stays unverified.`
      : "",
    "No paid build, repair, completion or release was performed. Voice and mobile remain unverified. Unattended maintenance is not configured.",
  ]
    .filter(Boolean)
    .join("\n");
  return { ok: true, plan, tracked, unresolved, message };
}

export async function runOfficeMaintenance(
  token: string,
  buildId: string,
): Promise<MaintenanceResult> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return { ok: false, message: backend.DENY_MESSAGES.backend_not_configured };
  return runOfficeMaintenanceWith(
    {
      verifyOwner: backend.verifyOwner,
      now: () => new Date().toISOString(),
      rest: (t, path, init) => backend.restRequest(config, t, path, init),
      snapshots: async (t, version, at) => {
        const { readRoomSnapshotWith } = await import("./room-snapshot.server");
        const out = new Map<string, RoomSnapshot | null>();
        // Serial reads stay independent of Claude's simultaneous-read investigation.
        for (const target of ROOM_TARGETS) {
          if (target.reserved) continue;
          const snap = await readRoomSnapshotWith({
            config,
            token: t,
            aal: "aal2",
            target,
            buildId: version,
            rest: backend.restRequest,
            now: () => new Date(at),
          }).catch(() => null);
          out.set(target.route, snap);
        }
        return out;
      },
    },
    token,
    buildId,
  );
}
