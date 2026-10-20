import type { BrainView, BrainTaskInfo } from "./brain-view";

const ACTIVE = new Set(["open", "in_progress", "waiting"]);

function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * The live "Now:" line for one Who's who card, from the same reads as the
 * live Brain view: Work Board tasks by team member, and the work logbook.
 * Returns null when the data isn't there, so the card says so instead of guessing.
 */
export function castNow(
  member: { who: string; workers: readonly string[] },
  tasks: BrainTaskInfo[] | null,
  view: BrainView,
  now: Date,
): string | null {
  if (member.who === "Brain") {
    const last = view.events.reduce<string | null>(
      (m, e) => (m === null || Date.parse(e.at) > Date.parse(m) ? e.at : m),
      null,
    );
    if (!last) return "No moves recorded yet.";
    return `${view.events.length} moves in the logbook; last one ${ago(last, now)}.`;
  }
  if (member.who === "Build workshop") {
    const open = view.items.filter(
      (i) => i.kind === "office-build" && !i.cancelled && i.stage !== "completed",
    );
    const stalled = open.filter((i) => i.stage === "stalled").length;
    if (!open.length) return "No builds open.";
    return `${open.length} build${open.length === 1 ? "" : "s"} open${stalled ? `, ${stalled} stalled` : ""}.`;
  }
  if (!tasks) return null;
  const mine = tasks.filter(
    (t) => ACTIVE.has(t.status) && member.workers.some((w) => t.worker.trim().toLowerCase() === w),
  );
  if (!mine.length) return "Nothing assigned on the Work Board.";
  const count = (st: string) => mine.filter((t) => t.status === st).length;
  const parts = [
    count("in_progress") ? `${count("in_progress")} in progress` : "",
    count("open") ? `${count("open")} not started` : "",
    count("waiting") ? `${count("waiting")} on hold` : "",
  ].filter(Boolean);
  return `${parts.join(", ")} on the Work Board.`;
}
