import type { OfficeNote } from "../src/lib/office-notes";

export const note: OfficeNote = {
  id: "note-1",
  kind: "decision",
  title: "Security review",
  detail: "Original",
  owner: "John",
  provenance: "ai-proposal",
  source: "Data room report: systems",
  createdAt: "2026-10-30T10:00:00Z",
};
export function fixture() {
  const data = new Map<string, Record<string, unknown>>([
    [
      note.id,
      {
        id: note.id,
        owner_id: "owner",
        title: note.title,
        detail: note.detail,
        source: note.source,
        provenance: note.provenance,
        created_at: note.createdAt,
      },
    ],
  ]);
  const state = { failRead: false, failWrite: false };
  const rest = async (path: string, init?: RequestInit) => {
    const query = new URLSearchParams(path.split("?")[1]);
    const matches = () =>
      [...data.values()].filter((row) =>
        [...query].every(
          ([key, value]) => !value.startsWith("eq.") || row[key] === JSON.parse(value.slice(3)),
        ),
      );
    if (init?.method === "PATCH") {
      if (state.failWrite) return { ok: false, body: null };
      const found = matches();
      found.forEach((row) => Object.assign(row, JSON.parse(String(init.body))));
      return { ok: true, body: found };
    }
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      if (data.has(row["id"]) || state.failWrite) return { ok: false, body: null };
      data.set(row["id"], row);
      return { ok: true, body: [row] };
    }
    return { ok: !state.failRead, body: state.failRead ? null : matches() };
  };
  return { data, rest, state };
}
