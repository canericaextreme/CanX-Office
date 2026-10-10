import sharedLogRaw from "../../docs/office-shared-log.json?raw";
import { parseSharedLog } from "./office-status";
import {
  SHELF_SOURCE,
  shelfNoteId,
  parseShelfFiling,
  defaultShelf,
  isShelfItemKey,
  type ShelfFiling,
} from "./brain-shelves";
import type { BrainIndex, BrainItem } from "./brain-index";
import type { BrainRest } from "./brain-index.server";
import type { BackendConfig } from "./canx-backend.server";
type Input = { config: BackendConfig; token: string; aal: string; rest: BrainRest };
type Row = Record<string, unknown>;
const text = (v: unknown, max = 300) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "";

/** Load all bounded filing pages. A partial/failing read never applies guessed labels. */
export async function readShelfLabels(
  input: Input,
): Promise<Map<string, { filing: ShelfFiling; raw: string }> | null> {
  if (input.aal !== "aal2") return null;
  const labels = new Map<string, { filing: ShelfFiling; raw: string }>();
  for (let offset = 0; offset < 10000; offset += 200) {
    const r = await input
      .rest(
        input.config,
        input.token,
        `office_notes?select=id,title,detail,source&source=eq.${encodeURIComponent(SHELF_SOURCE)}&order=id&limit=200&offset=${offset}`,
      )
      .catch(() => null);
    if (!r?.ok || !Array.isArray(r.body)) return null;
    for (const row of r.body as Row[]) {
      if (row["source"] !== SHELF_SOURCE) continue;
      const filing = parseShelfFiling(row["detail"]);
      if (!filing || row["id"] !== shelfNoteId(filing.itemKey) || row["title"] !== filing.itemKey)
        return null;
      labels.set(filing.itemKey, { filing, raw: String(row["detail"]) });
    }
    if (r.body.length < 200) return labels;
  }
  return null;
}
export async function addBrainShelves(index: BrainIndex, input: Input): Promise<BrainIndex> {
  const labels = await readShelfLabels(input);
  index.sources.push({
    key: "shelves",
    label: "Saved eight-shelf filing",
    status: input.aal !== "aal2" ? "denied" : labels ? "read" : "failed",
    count: labels?.size ?? null,
    detail: labels
      ? "Explicit filing labels; legacy categories preserved separately"
      : "Shelf assignments unavailable; saved filing must not be inferred",
  });
  if (input.aal === "aal2") {
    const r = await input
      .rest(
        input.config,
        input.token,
        "astra_memory?select=id,title,category,source,updated_at&active=is.true&order=updated_at.desc,id&limit=500",
      )
      .catch(() => null);
    const rows = r?.ok && Array.isArray(r.body) ? (r.body as Row[]) : null;
    index.sources.push({
      key: "memory",
      label: "Elsie active memory",
      status: rows ? "read" : "failed",
      count: rows?.length ?? null,
      detail:
        rows?.length === 500
          ? "showing up to 500; more may exist"
          : "Metadata only; memory content remains in its original record",
    });
    for (const row of rows ?? [])
      index.items.push({
        key: `memory:${text(row["id"], 80)}`,
        kind: "memory",
        title: text(row["title"]),
        room: "brain",
        folder: null,
        at: text(row["updated_at"], 40),
        provenance: `Elsie memory · ${text(row["category"], 40)} · ${text(row["source"], 120)}`,
        version: null,
        access: "saved memory metadata",
        defaultCategory: "memory",
        category: "memory",
        manual: false,
        route: "/brain#brain-memory",
        shelfOrigin: text(row["category"], 40),
      });
  } else
    index.sources.push({
      key: "memory",
      label: "Elsie active memory",
      status: "denied",
      count: null,
      detail: "needs two-step verification",
    });
  const log = parseSharedLog(sharedLogRaw);
  index.sources.push({
    key: "logbook",
    label: "Versioned Office shared log",
    status: log ? "read" : "failed",
    count: log?.length ?? null,
    detail: "Dated repository history, not a live connection check or background monitor",
  });
  for (const entry of log ?? [])
    index.items.push({
      key: `history:${entry.id}`,
      kind: "note",
      title: entry.summary,
      room: "build-testing",
      folder: null,
      at: entry.at,
      provenance: `docs/office-shared-log.json · ${entry.actor} · ${entry.kind}`,
      version: "app-versioned history",
      access: entry.evidence,
      defaultCategory: "memory",
      category: "memory",
      manual: false,
      route: "/claude",
      shelfOrigin: "CanX Brain: build history",
    });
  let orphan = 0;
  const seen = new Set(index.items.map((i) => i.key));
  for (const key of labels?.keys() ?? []) if (!seen.has(key)) orphan++;
  index.orphanLabels += orphan;
  index.items = index.items.map((item) => {
    const label = isShelfItemKey(item.key) ? labels?.get(item.key) : null;
    return {
      ...item,
      shelf: label?.filing.shelf ?? defaultShelf(item),
      shelfExpected: label?.raw ?? null,
      shelfManual: !!label,
      shelfReadable: labels !== null,
    };
  });
  return index;
}

/** Compare-and-save one separate shelf label. Never mutate an original record. */
export async function saveShelfWith(
  input: Input & { ownerId: string; filing: ShelfFiling; expected: string | null; now?: string },
) {
  if (input.aal !== "aal2")
    throw new Error("Two-step verification is required. Nothing was changed.");
  const { readBrainIndexWith } = await import("./brain-index.server");
  const index = await readBrainIndexWith({
    config: input.config,
    token: input.token,
    aal: input.aal,
    rest: input.rest,
  });
  const item = index.items.find((i) => i.key === input.filing.itemKey);
  if (!item || !item.shelfReadable)
    throw new Error("This saved item or its filing could not be read. Nothing was changed.");
  if (item.shelfExpected !== input.expected)
    throw new Error("The shelf changed elsewhere. Refresh before filing again.");
  const id = shelfNoteId(input.filing.itemKey),
    detail = JSON.stringify(input.filing);
  const filter = `id=eq.${id}&owner_id=eq.${input.ownerId}&source=eq.${encodeURIComponent(SHELF_SOURCE)}`;
  const row = {
    id,
    owner_id: input.ownerId,
    kind: "decision",
    title: input.filing.itemKey,
    detail,
    owner_name: "John",
    provenance: "john",
    source: SHELF_SOURCE,
    created_at: input.now ?? new Date().toISOString(),
  };
  const path =
    input.expected === null
      ? "office_notes"
      : `office_notes?${filter}&detail=eq.${encodeURIComponent(input.expected)}`;
  const saved = await input.rest(input.config, input.token, path, {
    method: input.expected === null ? "POST" : "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(input.expected === null ? [row] : row),
  });
  if (!saved.ok || !Array.isArray(saved.body) || saved.body.length !== 1)
    throw new Error(
      "The shelf changed elsewhere or could not be saved. Refresh before trying again.",
    );
  const back = await input.rest(
    input.config,
    input.token,
    `office_notes?select=title,detail,source&${filter}&limit=1`,
  );
  const actual =
    back.ok && Array.isArray(back.body) ? (back.body[0] as Row | undefined) : undefined;
  if (
    actual?.["title"] !== row["title"] ||
    actual?.["detail"] !== detail ||
    actual?.["source"] !== SHELF_SOURCE
  )
    throw new Error("The saved shelf could not be confirmed on re-read. Refresh to check it.");
  return input.filing;
}
