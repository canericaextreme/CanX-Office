/** Office Hours v1. UTC instants; reporting days are fixed UTC−07 Dawson Creek. */
export const OFFICE_HOURS_VOICE = "canx-office-hours-voice";
export const HOURS_SOURCE = "Office Hours: v1";
export const REQUESTED_START = Date.parse("2026-10-24T00:00:00-07:00");
export const DAY = 86_400_000;
export const HEARTBEAT = 10_000;
export type Span = { start: number; end: number };
export type HoursRecord = { id: string } & (
  | { type: "elapsed"; start: number; end: number; activeEnd: number }
  | { type: "control"; at: number; paused: boolean; idleMinutes: number }
  | {
      type: "correction";
      at: number;
      day: string;
      openMinutes: number;
      activeMinutes: number;
      reason: string;
    }
);
export function validRecord(r: HoursRecord, now = Date.now()): boolean {
  if (
    !r ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id)
  )
    return false;
  if (r.type === "elapsed")
    return (
      [r.start, r.end, r.activeEnd].every(Number.isFinite) &&
      r.start >= REQUESTED_START &&
      r.end <= now + 30_000 &&
      r.end > r.start &&
      r.end - r.start <= 30_000 &&
      r.activeEnd >= r.start &&
      r.activeEnd <= r.end
    );
  if (!Number.isFinite(r.at) || r.at < REQUESTED_START || r.at > now + 30_000) return false;
  if (r.type === "control")
    return (
      typeof r.paused === "boolean" &&
      Number.isInteger(r.idleMinutes) &&
      r.idleMinutes >= 1 &&
      r.idleMinutes <= 60
    );
  return (
    r.type === "correction" &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.day) &&
    dayKey(Date.parse(r.day + "T12:00:00-07:00")) === r.day &&
    r.day >= "2026-10-24" &&
    r.day <= dayKey(now) &&
    [r.openMinutes, r.activeMinutes].every((n) => Number.isFinite(n) && Math.abs(n) <= 1440) &&
    typeof r.reason === "string" &&
    r.reason.trim().length > 0 &&
    r.reason.length <= 240
  );
}
export function dayKey(at: number) {
  return new Date(at - 7 * 3_600_000).toISOString().slice(0, 10);
}
export function union(spans: Span[]): Span[] {
  const result: Span[] = [];
  for (const s of spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else result.push({ ...s });
  }
  return result;
}
export function elapsed(
  start: number,
  end: number,
  lastActivity: number,
  idleMinutes: number,
  voice: boolean,
): Omit<Extract<HoursRecord, { type: "elapsed" }>, "id"> | null {
  // A suspended/throttled clock proves no time between callbacks. Never backfill it.
  if (end <= start || end - start > 30_000 || start < REQUESTED_START) return null;
  return {
    type: "elapsed",
    start,
    end,
    activeEnd: voice ? end : Math.max(start, Math.min(end, lastActivity + idleMinutes * 60_000)),
  };
}
export function settings(records: HoursRecord[]) {
  return (
    records
      .filter((r): r is Extract<HoursRecord, { type: "control" }> => r.type === "control")
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))[0] ?? {
      paused: false,
      idleMinutes: 5,
    }
  );
}
export type HoursBucket = {
  label: string;
  open: number;
  active: number;
  correctionOpen: number;
  correctionActive: number;
  runningOpen: number;
  runningActive: number;
};
export function summarize(records: HoursRecord[], period: "day" | "week" | "month"): HoursBucket[] {
  const unique = [...new Map(records.map((r) => [r.id, r])).values()];
  const controls = unique
    .filter((r): r is Extract<HoursRecord, { type: "control" }> => r.type === "control")
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const spans = (active: boolean) =>
    union(
      unique.flatMap((r) => {
        if (r.type !== "elapsed") return [];
        const end = active ? r.activeEnd : r.end;
        const cuts = [
          r.start,
          ...controls.filter((c) => c.at > r.start && c.at < end).map((c) => c.at),
          end,
        ];
        return cuts
          .slice(0, -1)
          .flatMap((start, i) =>
            controls.filter((c) => c.at <= start).at(-1)?.paused
              ? []
              : [{ start, end: cuts[i + 1]! }],
          );
      }),
    );
  const daily = new Map<string, HoursBucket>();
  const bucket = (label: string) => {
    if (!daily.has(label))
      daily.set(label, {
        label,
        open: 0,
        active: 0,
        correctionOpen: 0,
        correctionActive: 0,
        runningOpen: 0,
        runningActive: 0,
      });
    return daily.get(label)!;
  };
  for (const active of [false, true])
    for (const s of spans(active)) {
      let cursor = s.start;
      while (cursor < s.end) {
        const key = dayKey(cursor);
        const end = Math.min(s.end, Date.parse(key + "T00:00:00-07:00") + DAY);
        bucket(key)[active ? "active" : "open"] += (end - cursor) / 3_600_000;
        cursor = end;
      }
    }
  const activation = unique
    .filter((r) => r.type === "elapsed")
    .map((r) => r.start)
    .sort((a, b) => a - b)[0];
  for (const r of unique)
    if (r.type === "correction" && activation !== undefined && r.day >= dayKey(activation)) {
      bucket(r.day).correctionOpen += r.openMinutes / 60;
      bucket(r.day).correctionActive += r.activeMinutes / 60;
    }
  const grouped = new Map<string, HoursBucket>();
  for (const b of daily.values()) {
    let key = b.label;
    if (period === "month") key = key.slice(0, 7);
    if (period === "week") {
      const d = new Date(key + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    const g = grouped.get(key) ?? {
      label: key,
      open: 0,
      active: 0,
      correctionOpen: 0,
      correctionActive: 0,
      runningOpen: 0,
      runningActive: 0,
    };
    for (const k of ["open", "active", "correctionOpen", "correctionActive"] as const) g[k] += b[k];
    grouped.set(key, g);
  }
  let open = 0,
    active = 0;
  return [...grouped.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((b) => ({
      ...b,
      runningOpen: (open += b.open + b.correctionOpen),
      runningActive: (active += b.active + b.correctionActive),
    }));
}
