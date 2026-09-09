/**
 * Internal office tasks and decisions saved by John.
 * Device-only storage until a CanX-owned backend is configured.
 */

export interface OfficeNote {
  id: string;
  kind: "task" | "decision";
  title: string;
  detail: string;
  owner: string;
  source: string;
  createdAt: string;
}

const KEY = "canx-office-notes";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function loadNotes(): OfficeNote[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 300).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: clean(row["id"], 40) || `n-${index}`,
        kind: row["kind"] === "decision" ? "decision" : "task",
        title: clean(row["title"], 300),
        detail: clean(row["detail"], 2000),
        owner: clean(row["owner"], 160),
        source: clean(row["source"], 120) || "John",
        createdAt: clean(row["createdAt"], 40) || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export function saveNotes(notes: OfficeNote[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes.slice(0, 300)));
  } catch {
    /* ignore storage errors */
  }
}
