import { createServerFn } from "@tanstack/react-start";
import { HOURS_SOURCE, validRecord, type HoursRecord } from "./office-hours";
type Rest = (path: string, init?: RequestInit) => Promise<{ ok: boolean; body: unknown }>;
export async function readHours(rest: Rest, since?: string): Promise<HoursRecord[]> {
  const result: HoursRecord[] = [];
  // Page all history on installation/reload; subsequent reads overlap a server-time cursor.
  for (let offset = 0; ; offset += 500) {
    const reply = await rest(
      `office_notes?select=id,detail&source=eq.${encodeURIComponent(HOURS_SOURCE)}&order=created_at.asc,id.asc&limit=500&offset=${offset}${since ? `&created_at=gte.${encodeURIComponent(since)}` : ""}`,
    );
    if (!reply.ok || !Array.isArray(reply.body))
      throw new Error("Office Hours records could not be read.");
    for (const row of reply.body) {
      const r = JSON.parse(row.detail) as HoursRecord;
      if (r.id !== row.id || !validRecord(r))
        throw new Error("An Office Hours record needs review.");
      result.push(r);
    }
    if (reply.body.length < 500) return result;
  }
}
export async function saveHours(rest: Rest, ownerId: string, records: HoursRecord[]) {
  if (records.length > 100 || records.some((r) => !validRecord(r)))
    throw new Error("Invalid Office Hours record.");
  if (!records.length) return;
  const rows = records.map((r) => ({
    id: r.id,
    owner_id: ownerId,
    kind: "decision",
    title: "Office Hours " + r.type,
    detail: JSON.stringify(r),
    owner_name: "John",
    provenance: "john",
    source: HOURS_SOURCE,
    created_at: new Date().toISOString(),
  }));
  const reply = await rest("office_notes?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!reply.ok)
    throw new Error("Office Hours save failed; pending records remain on this device.");
  const check = await rest(
    `office_notes?select=id,detail&source=eq.${encodeURIComponent(HOURS_SOURCE)}&id=in.(${records.map((r) => r.id).join(",")})`,
  );
  const saved = Array.isArray(check.body) ? (check.body as { id: string; detail: string }[]) : [];
  if (
    !check.ok ||
    records.some((r) => !saved.some((row) => row.id === r.id && row.detail === JSON.stringify(r)))
  )
    throw new Error("Office Hours save is awaiting readback verification.");
}
export const syncOfficeHours = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = v as { accessToken?: unknown; records?: unknown; since?: unknown };
    if (
      typeof raw?.accessToken !== "string" ||
      !Array.isArray(raw.records) ||
      raw.records.length > 100 ||
      raw.records.some((r) => !validRecord(r))
    )
      throw new Error("Invalid Office Hours request.");
    const since =
      typeof raw.since === "string" && Number.isFinite(Date.parse(raw.since))
        ? new Date(raw.since).toISOString()
        : undefined;
    return {
      accessToken: raw.accessToken.slice(0, 4000),
      records: raw.records as HoursRecord[],
      since,
    };
  })
  .handler(async ({ data }) => handleOfficeHours(data));

export async function handleOfficeHours(data: {
  accessToken: string;
  records: HoursRecord[];
  since?: string | undefined;
}): Promise<{ ok: true; records: HoursRecord[]; cursor: string } | { ok: false; message: string }> {
  const b = await import("./canx-backend.server");
  const config = b.readBackendConfig();
  if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
  const owner = await b.verifyOwner(data.accessToken);
  if (!owner.ok || owner.viewer)
    return { ok: false, message: owner.ok ? "Owner sign-in required." : owner.message };
  const rest: Rest = (p, i) => b.restRequest(config, data.accessToken, p, i);
  try {
    const cursor = new Date().toISOString();
    await saveHours(rest, owner.userId, data.records);
    return { ok: true, records: await readHours(rest, data.since), cursor };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Office Hours unavailable." };
  }
}
