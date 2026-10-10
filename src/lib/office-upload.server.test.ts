import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmOriginalUpload } from "./office-upload.server";
const upload = {
  filename: "New name.pdf",
  room: "legal",
  folder: "Start Here",
  content_hash: "a".repeat(64),
  size_bytes: 10,
  mime_type: "application/pdf",
};
function database(
  options: { storageFailure?: boolean; readFailure?: boolean; existing?: boolean } = {},
) {
  let row: Record<string, unknown> | null = options.existing
    ? {
        ...upload,
        filename: "Original name.pdf",
        object_path: `owner/${upload.content_hash}/original`,
      }
    : null;
  const eq = vi.fn((_field: string, _value: string): unknown => query);
  const query = {
    eq,
    select: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: options.readFailure ? null : row,
      error: options.readFailure ? {} : null,
    })),
  };
  const upsert = vi.fn(
    async (value: Record<string, unknown>, policy: { ignoreDuplicates: boolean }) => {
      if (!row || !policy.ignoreDuplicates) row = value;
      return { error: null };
    },
  );
  const db = {
    storage: {
      from: () => ({
        list: async () => ({
          error: options.storageFailure ? {} : null,
          data: [{ name: "original", metadata: { size: 10 } }],
        }),
      }),
    },
    from: vi.fn(() => ({ ...query, upsert })),
  } as unknown as SupabaseClient;
  return { db, eq, upsert };
}
it("reads the persisted row independently with every owner/file identity filter", async () => {
  const d = database();
  const result = await confirmOriginalUpload(d.db, "owner", upload);
  expect(result.filename).toBe(upload.filename);
  expect(d.eq.mock.calls).toEqual([
    ["owner_id", "owner"],
    ["content_hash", upload.content_hash],
    ["room", "legal"],
    ["folder", "Start Here"],
  ]);
});
it("preserves an existing original filename on a duplicate upload", async () => {
  const d = database({ existing: true });
  expect((await confirmOriginalUpload(d.db, "owner", upload)).filename).toBe("Original name.pdf");
  expect(d.upsert.mock.calls[0]?.[1].ignoreDuplicates).toBe(true);
});
it("does not save metadata when original storage verification fails", async () => {
  const d = database({ storageFailure: true });
  await expect(confirmOriginalUpload(d.db, "owner", upload)).rejects.toThrow("not verified");
  expect(d.upsert).not.toHaveBeenCalled();
});
it("does not report a saved upload when independent readback fails", async () => {
  const d = database({ readFailure: true });
  await expect(confirmOriginalUpload(d.db, "owner", upload)).rejects.toThrow(
    "filing was not confirmed",
  );
});
