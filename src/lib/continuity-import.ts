import type { OfficeNote } from "./office-notes";

/** Append-only handover: reject oversized fields rather than silently losing memories. */
export function parseContinuityImport(text: string): { title: string; detail: string }[] {
  if (text.length > 50000) throw new Error("The handover file is too large.");
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || !data.length || data.length > 20) throw new Error("Use a handover with 1–20 memory records.");
  return data.map(row => {
    if (!row || typeof row.title !== "string" || typeof row.detail !== "string" || !row.title.trim() || !row.detail.trim()
      || row.title.length > 300 || row.detail.length > 2000) throw new Error("Each memory needs a title (up to 300 characters) and detail (up to 2,000). Nothing was imported.");
    return { title: row.title.trim(), detail: row.detail.trim() };
  });
}

export function newContinuityNotes(rows: { title: string; detail: string }[], existing: OfficeNote[]): OfficeNote[] {
  const known = new Set(existing.filter(note => note.source === "CanX Brain: continuity").map(note => JSON.stringify([note.title, note.detail])));
  return rows.flatMap(row => {
    const key = JSON.stringify([row.title, row.detail]);
    if (known.has(key)) return [];
    known.add(key);
    // Ignore all supplied IDs; never overwrite existing records during a handover.
    return [{ ...row, id: crypto.randomUUID(), kind: "decision" as const, owner: "", provenance: "ai-proposal" as const,
      source: "CanX Brain: continuity", createdAt: new Date().toISOString() }];
  });
}
