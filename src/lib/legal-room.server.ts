import { LEGAL_SOURCE, legalNoteId, parseLegalFiling, type LegalFiling } from "./legal-room";
export async function readLegalFilings(data: { accessToken: string }) {
  const b = await import("./canx-backend.server");
  const config = b.readBackendConfig();
  if (!config) throw new Error("Legal filing is unavailable.");
  const owner = await (await import("./canx-viewer.server")).verifyOwnerOrViewerRead(data.accessToken);
  if (!owner.ok) throw new Error(owner.message);
  const filings: Record<string, LegalFiling> = {};
  for (let offset = 0; offset < 10000; offset += 200) {
    const reply = await b.restRequest(
      config,
      data.accessToken,
      `office_notes?select=id,detail&source=eq.${encodeURIComponent(LEGAL_SOURCE)}&owner_id=eq.${owner.userId}&order=id&limit=200&offset=${offset}`,
    );
    if (!reply.ok || !Array.isArray(reply.body))
      throw new Error("Legal filing labels could not be loaded.");
    for (const raw of reply.body) {
      const row = raw as { id: string; detail: string };
      const filing = parseLegalFiling(row.detail);
      if (!filing || !row.id.startsWith("legal-"))
        throw new Error("A legal filing label needs repair.");
      filings[row.id.slice(6)] = filing;
    }
    if (reply.body.length < 200) return filings;
  }
  throw new Error("Too many filing labels to load safely.");
}
export async function writeLegalFiling(data: {
  accessToken: string;
  fileId: string;
  filing: LegalFiling;
  expected: string | null;
}) {
  const b = await import("./canx-backend.server");
  const config = b.readBackendConfig();
  if (!config) throw new Error("Legal filing is unavailable.");
  const owner = await b.verifyOwner(data.accessToken);
  if (!owner.ok) throw new Error(owner.message);
  const fileFilter = `id=eq.${data.fileId}&owner_id=eq.${owner.userId}&room=eq.legal`;
  let found = false;
  for (const table of ["office_files", "office_links"]) {
    const r = await b.restRequest(
      config,
      data.accessToken,
      `${table}?select=id&${fileFilter}&limit=1`,
    );
    if (!r.ok) throw new Error("The Legal document could not be checked.");
    if (Array.isArray(r.body) && r.body.length) found = true;
  }
  if (!found) throw new Error("This document is not saved in Legal. Nothing was changed.");
  const id = legalNoteId(data.fileId),
    detail = JSON.stringify(data.filing);
  const row = {
    id,
    owner_id: owner.userId,
    kind: "decision",
    title: data.fileId,
    detail,
    owner_name: "John",
    provenance: "john",
    source: LEGAL_SOURCE,
    created_at: new Date().toISOString(),
  };
  const path =
    data.expected === null
      ? "office_notes"
      : `office_notes?id=eq.${id}&owner_id=eq.${owner.userId}&source=eq.${encodeURIComponent(LEGAL_SOURCE)}&detail=eq.${encodeURIComponent(data.expected)}`;
  const saved = await b.restRequest(config, data.accessToken, path, {
    method: data.expected === null ? "POST" : "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(data.expected === null ? [row] : row),
  });
  if (!saved.ok || !Array.isArray(saved.body) || saved.body.length !== 1)
    throw new Error(
      "The filing changed elsewhere or could not be saved. Refresh before trying again.",
    );
  const back = await b.restRequest(
    config,
    data.accessToken,
    `office_notes?select=detail,source&id=eq.${id}&owner_id=eq.${owner.userId}&limit=1`,
  );
  const r =
    back.ok && Array.isArray(back.body)
      ? (back.body[0] as { detail?: string; source?: string })
      : null;
  if (!r || r.detail !== detail || r.source !== LEGAL_SOURCE)
    throw new Error("The saved filing could not be confirmed. Refresh to check it.");
  await b
    .restRequest(config, data.accessToken, "office_audit", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        owner_id: owner.userId,
        action: "legal.file",
        entity: "office_notes",
        entity_id: id,
        detail: { fileId: data.fileId },
      }),
    })
    .catch(() => null);
  return data.filing;
}
