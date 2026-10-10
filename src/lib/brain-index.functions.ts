import { createServerFn } from "@tanstack/react-start";
import type { BrainIndex, BrainCategory } from "./brain-index";

const tok = (v: unknown) => (typeof (v as { accessToken?: unknown })?.accessToken === "string" ? (v as { accessToken: string }).accessToken.slice(0, 4000) : "");

/** Read the whole Brain index for the signed-in owner. Read-only. */
export const getBrainIndex = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(async ({ data }): Promise<{ ok: true; index: BrainIndex } | { ok: false; message: string }> => {
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const who = await (await import("./canx-viewer.server")).verifySignedInOrViewerRead(data.accessToken);
    if (!who.ok) return { ok: false, message: who.message };
    const { readBrainIndexWith } = await import("./brain-index.server");
    return { ok: true, index: await readBrainIndexWith({ config, token: data.accessToken, aal: who.aal, rest: b.restRequest }) };
  });

/**
 * File one item under a category. Writes ONE label record (deterministic id per
 * item) in the owner-only shared notes; the original file/document/note is not
 * touched. Success only after the label is read back with the chosen category.
 */
export const setBrainCategory = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = (v ?? {}) as { itemKey?: unknown; category?: unknown };
    return { accessToken: tok(v), itemKey: typeof raw.itemKey === "string" ? raw.itemKey.slice(0, 90) : "", category: typeof raw.category === "string" ? raw.category.slice(0, 20) : "" };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; category?: BrainCategory }> => {
    const { isBrainCategory, isItemKey, categoryNoteId, CATEGORY_NOTE_SOURCE, CATEGORY_LABELS } = await import("./brain-index");
    if (!isItemKey(data.itemKey) || !isBrainCategory(data.category)) return { ok: false, message: "That item or category isn't recognised. Nothing was changed." };
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const id = categoryNoteId(data.itemKey);
    const row = { id, owner_id: owner.userId, kind: "decision", title: data.itemKey, detail: data.category, owner_name: "John", provenance: "john", source: CATEGORY_NOTE_SOURCE, created_at: new Date().toISOString() };
    const saved = await b.restRequest(config, data.accessToken, "office_notes?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]) });
    if (!saved.ok) return { ok: false, message: "The category was not saved. Nothing else changed." };
    const back = await b.restRequest(config, data.accessToken, `office_notes?select=title,detail,source&id=eq.${encodeURIComponent(id)}&limit=1`);
    const r = back.ok && Array.isArray(back.body) ? (back.body[0] as Record<string, unknown> | undefined) : undefined;
    if (!r || r["title"] !== data.itemKey || r["detail"] !== data.category || r["source"] !== CATEGORY_NOTE_SOURCE) return { ok: false, message: "The category could not be confirmed on re-read. Please check again before relying on it." };
    await b.restRequest(config, data.accessToken, "office_audit", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_id: owner.userId, action: "brain.categorise", entity: "office_notes", entity_id: id, detail: { item: data.itemKey, category: data.category } }) }).catch(() => null);
    return { ok: true, message: `Filed under ${CATEGORY_LABELS[data.category]} and confirmed. The original was not changed.`, category: data.category };
  });

/** Eight-shelf filing through existing owner/MFA and row security. */
export const setBrainShelf = createServerFn({ method: "POST" })
  .inputValidator(
    (v: { accessToken: string; itemKey: string; shelf: string; expected: string | null }) => ({
      accessToken: tok(v),
      itemKey: v.itemKey,
      shelf: v.shelf,
      expected: v.expected,
    }),
  )
  .handler(async ({ data }) => {
    const { isBrainShelf, isShelfItemKey } = await import("./brain-shelves");
    if (
      !isBrainShelf(data.shelf) ||
      !isShelfItemKey(data.itemKey) ||
      !(
        data.expected === null ||
        (typeof data.expected === "string" && data.expected.length <= 500)
      )
    )
      return { ok: false, message: "Choose a saved item and shelf. Nothing was changed." };
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    try {
      const { saveShelfWith } = await import("./brain-shelves.server");
      await saveShelfWith({
        config,
        token: data.accessToken,
        aal: "aal2",
        ownerId: owner.userId,
        rest: b.restRequest,
        filing: { version: 1, itemKey: data.itemKey, shelf: data.shelf },
        expected: data.expected,
      });
      return { ok: true, message: "Shelf filing saved and confirmed. Original unchanged." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Shelf filing was not confirmed.",
      };
    }
  });
