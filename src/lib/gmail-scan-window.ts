import { OFFICE_TIMEZONE } from "./subscriptions";

export const DEFAULT_GMAIL_SCAN_FROM_DATE = "2026-08-15";
export const HISTORICAL_SCAN_STEPS_PER_START = 4;

export type GmailScanStatus = "paused" | "complete" | "failed";

export interface GmailScanConfig {
  fromDate: string;
  endAt: string;
  status: GmailScanStatus;
  savedAt: string;
}

export function validScanDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function cleanGmailScanConfig(input: unknown): GmailScanConfig | null {
  const row = input as Partial<GmailScanConfig> | null;
  if (!row || !validScanDate(row.fromDate) || typeof row.endAt !== "string" || Number.isNaN(Date.parse(row.endAt))) return null;
  return {
    fromDate: row.fromDate,
    endAt: new Date(row.endAt).toISOString(),
    status: row.status === "complete" || row.status === "failed" ? row.status : "paused",
    savedAt: typeof row.savedAt === "string" && !Number.isNaN(Date.parse(row.savedAt)) ? new Date(row.savedAt).toISOString() : "",
  };
}

function offsetAtLocalNoon(date: string, timeZone: string): number {
  const probe = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(probe);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return represented - probe.getTime();
}

/** Start of the selected calendar day in the Office timezone. */
export function localDayStart(date: string, timeZone = OFFICE_TIMEZONE): Date | null {
  if (!validScanDate(date)) return null;
  const noonOffset = offsetAtLocalNoon(date, timeZone);
  return new Date(Date.parse(`${date}T00:00:00Z`) - noonOffset);
}

/**
 * Gmail `after:` and `before:` are strict. Subtract/add one second so the
 * requested local-day start and frozen run end are inclusive at second precision.
 */
export function datedGmailQuery(baseQuery: string, fromDate: string, endAt: string): string | null {
  const start = localDayStart(fromDate);
  const endMs = Date.parse(endAt);
  if (!start || Number.isNaN(endMs) || start.getTime() > endMs) return null;
  const withoutRollingWindow = baseQuery.replace(/\s+newer_than:\S+/g, "").trim();
  const after = Math.floor(start.getTime() / 1000) - 1;
  const before = Math.floor(endMs / 1000) + 1;
  return `${withoutRollingWindow} after:${after} before:${before}`;
}
