import type { SupabaseClient } from "@supabase/supabase-js";
import { FILE_BUCKET, type OfficeFile } from "./office-files";
type Upload = {
  filename: string;
  room: string;
  folder: string;
  content_hash: string;
  size_bytes: number;
  mime_type: string;
};
/** Called only after the existing signed-in/Finance owner checks. */
export async function confirmOriginalUpload(
  db: SupabaseClient,
  ownerId: string,
  data: Upload,
): Promise<OfficeFile> {
  const path = `${ownerId}/${data.content_hash}/original`;
  const { data: objects, error } = await db.storage
    .from(FILE_BUCKET)
    .list(`${ownerId}/${data.content_hash}`, { limit: 10 });
  const object = objects?.find((f) => f.name === "original");
  if (error || !object || Number(object.metadata?.size) !== data.size_bytes)
    throw new Error("Original file upload was not verified. Retry the same file.");
  const { error: saveError } = await db
    .from("office_files")
    .upsert(
      {
        owner_id: ownerId,
        filename: data.filename,
        room: data.room,
        folder: data.folder,
        object_path: path,
        content_hash: data.content_hash,
        size_bytes: data.size_bytes,
        mime_type: data.mime_type,
      },
      { onConflict: "owner_id,content_hash,room,folder", ignoreDuplicates: true },
    );
  if (saveError)
    throw new Error("Original uploaded, but filing was not confirmed. Retry the same file.");
  // A duplicate never renames an existing entry. Read independently after insertion.
  const { data: row, error: readError } = await db
    .from("office_files")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_hash", data.content_hash)
    .eq("room", data.room)
    .eq("folder", data.folder)
    .single();
  if (readError || !row || row.object_path !== path || row.size_bytes !== data.size_bytes)
    throw new Error("Original uploaded, but filing was not confirmed. Retry the same file.");
  return row as OfficeFile;
}
