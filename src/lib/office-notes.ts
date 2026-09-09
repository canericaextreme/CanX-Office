/**
 * Internal office tasks and decisions saved by John.
 * Device-only storage until a CanX-owned backend is configured.
 *
 * Every record carries its own provenance. John's own notes are NOT
 * demonstration data and must never be described as such.
 */

export type NoteProvenance = "john" | "ai-proposal" | "sample";

export interface OfficeNote {
  id: string;
  kind: "task" | "decision";
  title: string;
  detail: string;
  owner: string;
  /** Where this record came from. */
  provenance: NoteProvenance;
  /** Human-readable origin, e.g. "John" or "Office Manager (AI proposal)". */
  source: string;
  createdAt: string;
}

export const PROVENANCE_LABELS: Record<NoteProvenance, string> = {
  john: "Created by John",
  "ai-proposal": "Proposed by the Office Manager, saved by John",
  sample: "Demonstration sample",
};

const KEY = "canx-office-notes";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function provenanceOf(row: Record<string, unknown>): NoteProvenance {
  const raw = clean(row["provenance"], 20);
  if (raw === "john" || raw === "ai-proposal" || raw === "sample") return raw;
  // Legacy records: infer from the old free-text source field.
  const source = clean(row["source"], 120).toLowerCase();
  if (source.includes("sample") || source.includes("demonstration")) return "sample";
  if (source.includes("manager") || source.includes("ai")) return "ai-proposal";
  return "john";
}

export function loadNotes(): OfficeNote[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 300).map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const provenance = provenanceOf(row);
      return {
        id: clean(row["id"], 40) || `n-${index}`,
        kind: row["kind"] === "decision" ? "decision" : "task",
        title: clean(row["title"], 300),
        detail: clean(row["detail"], 2000),
        owner: clean(row["owner"], 160),
        provenance,
        source: clean(row["source"], 120) || PROVENANCE_LABELS[provenance],
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
