import { roomReportSource } from "./manager-room-commands";

type Rest = (config: never, token: string, path: string, init?: RequestInit) => Promise<{ ok: boolean; body: unknown }>;

/**
 * Saves the result of an explicit, owner-triggered skill run as a room report (office_notes),
 * then re-reads it by exact id and content. Returns not-saved/unverified honestly; never retries.
 */
export async function saveSkillRunRecord(input: {
  accessToken: string; userId?: string; roomId: string; title: string; detail: string; now?: string;
  deps?: { config: unknown; rest: Rest };
}): Promise<{ ok: true; id: string } | { ok: false; reason: "not_configured" | "not_saved" | "unverified" }> {
  let config = input.deps?.config;
  let rest = input.deps?.rest;
  if (!config || !rest) {
    const backend = await import("./canx-backend.server");
    config = backend.readBackendConfig();
    rest = backend.restRequest as unknown as Rest;
  }
  if (!config) return { ok: false, reason: "not_configured" };
  let userId = input.userId;
  if (!userId) {
    const backend = await import("./canx-backend.server");
    const who = await backend.verifyOwner(input.accessToken).catch(() => null);
    if (!who?.ok) return { ok: false, reason: "not_saved" };
    userId = who.userId;
  }
  const id = crypto.randomUUID();
  const detail = input.detail.slice(0, 2000);
  const row = { id, owner_id: userId, kind: "decision", title: input.title.slice(0, 200), detail, owner_name: "John",
    provenance: "ai-proposal", source: roomReportSource(input.roomId), created_at: input.now ?? new Date().toISOString() };
  const saved = await rest(config as never, input.accessToken, "office_notes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([row]) }).catch(() => null);
  if (!saved?.ok) return { ok: false, reason: "not_saved" };
  const back = await rest(config as never, input.accessToken, `office_notes?select=id,detail&id=eq.${encodeURIComponent(id)}&limit=1`).catch(() => null);
  const rows = back?.ok && Array.isArray(back.body) ? back.body as Array<Record<string, unknown>> : [];
  return rows.some((r) => r["id"] === id && r["detail"] === detail) ? { ok: true, id } : { ok: false, reason: "unverified" };
}

export function skillRunRecordLine(r: Awaited<ReturnType<typeof saveSkillRunRecord>>, room: string): string {
  if (r.ok) return `Saved and re-read as a ${room} room report (record ${r.id}).`;
  return r.reason === "unverified" ? `The ${room} room report save was accepted but could not be re-read; check Records before repeating.` : `The result was not saved as a ${room} room report.`;
}
