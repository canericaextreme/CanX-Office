import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import type { ActivityRecord, ActivityStage } from "./office-activity-log";
import { FRESHNESS_MS } from "./work-activity";

export const STAGE_COLORS: Record<ActivityStage | "unknown", string> = {
  brainstorming: "#c084fc",
  strategizing: "#38bdf8",
  building: "#fbbf24",
  stalled: "#fb7185",
  completed: "#4ade80",
  unknown: "#94a3b8",
};
export function activityStage(record: ActivityRecord, now: number): ActivityStage {
  if (record.state === "completed") return "completed";
  const age = now - Date.parse(record.lastHeartbeat);
  if (record.state !== "running" || !Number.isFinite(age) || age < 0 || age > FRESHNESS_MS)
    return "stalled";
  return record.stage ?? "strategizing";
}
export function networkSnapshot(records: ActivityRecord[], now = Date.now()) {
  // Discard malformed optional device metadata; never infer rooms from job titles/cell IDs.
  const known = new Set(OFFICE_ROOM_IDENTITIES.map((r) => r.id));
  const mapped = records.filter((r) => typeof r.roomId === "string" && known.has(r.roomId));
  const rooms = OFFICE_ROOM_IDENTITIES.map((room, index) => {
    const angle = (index / OFFICE_ROOM_IDENTITIES.length) * Math.PI * 2 - Math.PI / 2;
    const tasks = mapped.filter((r) => r.roomId === room.id);
    const stages = tasks.map((r) => activityStage(r, now));
    const stage: ActivityStage | "unknown" =
      (["stalled", "building", "strategizing", "brainstorming", "completed"] as const).find((s) =>
        stages.includes(s),
      ) ?? "unknown";
    return {
      ...room,
      x: 500 + Math.cos(angle) * 370,
      y: 340 + Math.sin(angle) * 270,
      stage,
      tasks: tasks.length,
    };
  });
  const transfers = mapped.flatMap((r) =>
    Array.isArray(r.handoffs)
      ? r.handoffs
          .filter(
            (h) =>
              h &&
              known.has(h.from) &&
              known.has(h.to) &&
              h.from !== h.to &&
              Number.isFinite(Date.parse(h.at)) &&
              Date.parse(h.at) <= now,
          )
          .map((h) => ({
            ...h,
            taskId: r.taskId,
            active:
              r.state === "running" &&
              activityStage(r, now) !== "stalled" &&
              now - Date.parse(h.at) < 2400,
          }))
      : [],
  );
  const counts = Object.keys(STAGE_COLORS).map((stage) => ({
    stage,
    count: rooms.filter((r) => r.stage === stage).length,
  }));
  return {
    rooms,
    transfers,
    counts,
    unmapped: records.length - mapped.length,
    recorded: records.length,
  };
}
export function networkNarration(snapshot: ReturnType<typeof networkSnapshot>) {
  return `Device-only Office board, ${snapshot.recorded} retained work records. ${snapshot.rooms.map((r) => `${r.label}: ${r.stage}, ${r.tasks} tasks`).join("; ")}. ${snapshot.transfers.length} recorded handoffs. ${snapshot.unmapped} records have no known room. Unknown means no room evidence, not idle. This is not whole-office live verification.`;
}
