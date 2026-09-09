/**
 * Shared office records (tasks, decisions, round table) in the CanX-owned
 * database. Every call re-verifies the owner on the server. While no database
 * is configured, every call denies and the office stays in device-only mode.
 *
 * Nothing here overwrites a device record silently: importing device data into
 * the shared account is an explicit, validated, additive merge.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerDenyReason } from "@/lib/canx-backend.server";
import type { OfficeNote } from "@/lib/office-notes";

export interface RecordsResult<T> {
  ok: boolean;
  reason: OwnerDenyReason | "backend_error" | null;
  message: string;
  data: T | null;
}

function fail<T>(reason: OwnerDenyReason | "backend_error", message: string): RecordsResult<T> {
  return { ok: false, reason, message, data: null };
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function cleanNote(input: unknown): OfficeNote | null {
  const row = (input ?? {}) as Record<string, unknown>;
  const title = str(row["title"], 300).trim();
  if (!title) return null;
  const provenance = ["john", "ai-proposal", "sample"].includes(str(row["provenance"], 20))
    ? (str(row["provenance"], 20) as OfficeNote["provenance"])
    : "john";
  return {
    id: str(row["id"], 60) || `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: row["kind"] === "decision" ? "decision" : "task",
    title,
    detail: str(row["detail"], 2000),
    owner: str(row["owner"], 160),
    provenance,
    source: str(row["source"], 120) || "John",
    createdAt: str(row["createdAt"], 40) || new Date().toISOString(),
  };
}

async function withOwner<T>(
  accessToken: string,
  run: (ctx: {
    config: NonNullable<Awaited<ReturnType<typeof import("@/lib/canx-backend.server").readBackendConfig>>>;
    userId: string;
    token: string;
    rest: typeof import("@/lib/canx-backend.server").restRequest;
  }) => Promise<RecordsResult<T>>,
): Promise<RecordsResult<T>> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return fail("backend_not_configured", backend.DENY_MESSAGES.backend_not_configured);
  const verified = await backend.verifyOwner(accessToken);
  if (!verified.ok) return fail(verified.reason, verified.message);
  return run({ config, userId: verified.userId, token: accessToken, rest: backend.restRequest });
}

const tokenOf = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

/* ----------------------------- notes ----------------------------- */

export const listSharedNotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: tokenOf(input) }))
  .handler(async ({ data }): Promise<RecordsResult<OfficeNote[]>> =>
    withOwner<OfficeNote[]>(data.accessToken, async ({ config, token, rest }) => {
      const response = await rest(config, token, "office_notes?select=*&order=created_at.desc&limit=300");
      if (!response.ok) return fail("backend_error", "The shared records could not be read.");
      const rows = Array.isArray(response.body) ? response.body : [];
      const notes = rows
        .map((row) => {
          const r = row as Record<string, unknown>;
          return cleanNote({
            id: r["id"],
            kind: r["kind"],
            title: r["title"],
            detail: r["detail"],
            owner: r["owner_name"],
            provenance: r["provenance"],
            source: r["source"],
            createdAt: r["created_at"],
          });
        })
        .filter((note): note is OfficeNote => note !== null);
      return { ok: true, reason: null, message: "", data: notes };
    }),
  );

export const saveSharedNotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { accessToken?: unknown; notes?: unknown } | undefined;
    const notes = Array.isArray(raw?.notes) ? raw.notes.slice(0, 300) : [];
    return { accessToken: tokenOf(input), notes };
  })
  .handler(async ({ data }): Promise<RecordsResult<{ saved: number }>> =>
    withOwner<{ saved: number }>(data.accessToken, async ({ config, token, userId, rest }) => {
      const rows = data.notes
        .map(cleanNote)
        .filter((note): note is OfficeNote => note !== null)
        .map((note) => ({
          id: note.id,
          owner_id: userId,
          kind: note.kind,
          title: note.title,
          detail: note.detail,
          owner_name: note.owner,
          provenance: note.provenance,
          source: note.source,
          created_at: note.createdAt,
        }));
      if (!rows.length) return { ok: true, reason: null, message: "Nothing to save.", data: { saved: 0 } };
      const response = await rest(config, token, "office_notes?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!response.ok) return fail("backend_error", "The shared records could not be saved.");
      await rest(config, token, "office_audit", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ owner_id: userId, action: "notes.save", entity: "office_notes", detail: { count: rows.length } }),
      });
      return { ok: true, reason: null, message: "Saved to the CanX account.", data: { saved: rows.length } };
    }),
  );

export const deleteSharedNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { id?: unknown } | undefined;
    return { accessToken: tokenOf(input), id: typeof raw?.id === "string" ? raw.id.slice(0, 60) : "" };
  })
  .handler(async ({ data }): Promise<RecordsResult<{ deleted: boolean }>> =>
    withOwner<{ deleted: boolean }>(data.accessToken, async ({ config, token, userId, rest }) => {
      if (!data.id) return fail("backend_error", "No record was named.");
      const response = await rest(config, token, `office_notes?id=eq.${encodeURIComponent(data.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (!response.ok) return fail("backend_error", "The record could not be removed.");
      await rest(config, token, "office_audit", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ owner_id: userId, action: "notes.delete", entity: "office_notes", entity_id: data.id, detail: {} }),
      });
      return { ok: true, reason: null, message: "Removed.", data: { deleted: true } };
    }),
  );

/* -------------------------- round table -------------------------- */

export const loadSharedRoundTable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { key?: unknown } | undefined;
    return { accessToken: tokenOf(input), key: typeof raw?.key === "string" ? raw.key.slice(0, 80) : "" };
  })
  // The document is returned as JSON text so the transport stays plainly serializable.
  .handler(async ({ data }): Promise<RecordsResult<string>> =>
    withOwner<string>(data.accessToken, async ({ config, token, rest }) => {
      const response = await rest(config, token, `round_tables?select=doc&key=eq.${encodeURIComponent(data.key)}&limit=1`);
      if (!response.ok) return fail("backend_error", "The meeting record could not be read.");
      const rows = Array.isArray(response.body) ? (response.body as Array<{ doc?: unknown }>) : [];
      const doc = rows[0]?.doc ?? null;
      return { ok: true, reason: null, message: "", data: doc ? JSON.stringify(doc) : "" };
    }),
  );

export const saveSharedRoundTable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { key?: unknown; doc?: unknown } | undefined;
    return {
      accessToken: tokenOf(input),
      key: typeof raw?.key === "string" ? raw.key.slice(0, 80) : "",
      doc: typeof raw?.doc === "string" ? raw.doc.slice(0, 200_000) : "",
    };
  })
  .handler(async ({ data }): Promise<RecordsResult<{ saved: boolean }>> =>
    withOwner<{ saved: boolean }>(data.accessToken, async ({ config, token, userId, rest }) => {
      if (!data.key || !data.doc) return fail("backend_error", "The meeting record was not in the expected shape.");
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data.doc);
      } catch {
        return fail("backend_error", "The meeting record was not in the expected shape.");
      }
      if (!parsed || typeof parsed !== "object") return fail("backend_error", "The meeting record was not in the expected shape.");
      const response = await rest(config, token, "round_tables?on_conflict=key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{ key: data.key, owner_id: userId, doc: parsed, updated_at: new Date().toISOString() }]),
      });
      if (!response.ok) return fail("backend_error", "The meeting record could not be saved.");
      await rest(config, token, "office_audit", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ owner_id: userId, action: "round_table.save", entity: "round_tables", entity_id: data.key, detail: {} }),
      });
      return { ok: true, reason: null, message: "Saved to the CanX account.", data: { saved: true } };
    }),
  );
