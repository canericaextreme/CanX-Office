/**
 * Google Drive through the linked "canerica's Google Drive" connection.
 *
 * Granted scope is drive.file only: the office can see and edit files it
 * created itself (or files explicitly opened to it). It cannot browse or
 * search John's existing Drive, and list results are labelled accordingly.
 * No delete operation exists here by design.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const TIMEOUT_MS = 20_000;
const MAX_READ_BYTES = 200_000;
const MAX_WRITE_CHARS = 100_000;
const MAX_LIST = 50;

export interface DriveSettings {
  lovableApiKey: string;
  connectionApiKey: string;
}

export function readDriveSettings(): DriveSettings | null {
  const lovableApiKey = process.env["LOVABLE_API_KEY"]?.trim();
  const connectionApiKey = process.env["GOOGLE_DRIVE_API_KEY"]?.trim();
  if (!lovableApiKey || !connectionApiKey) return null;
  return { lovableApiKey, connectionApiKey };
}

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

export type DriveResult =
  | { ok: true; files?: DriveFileSummary[]; file?: DriveFileSummary; text?: string; detail: string }
  | { ok: false; detail: string; providerStatus?: number };

const SCOPE_NOTE =
  "Permission is selected-files only: this lists files the office created or that were explicitly shared to it, not your whole Drive.";

async function gateway(
  settings: DriveSettings,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(`${GATEWAY}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${settings.lovableApiKey}`,
        "X-Connection-Api-Key": settings.connectionApiKey,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fail(response: Response): Promise<DriveResult> {
  const body = await response.text();
  console.error(`Drive gateway request failed [${response.status}]: ${body.slice(0, 500)}`);
  return {
    ok: false,
    providerStatus: response.status,
    detail: `Google Drive request failed (status ${response.status}). Nothing was changed.`,
  };
}

export async function listDriveFilesWith(
  settings: DriveSettings,
  fetchImpl: typeof fetch,
): Promise<DriveResult> {
  const response = await gateway(
    settings,
    `/files?pageSize=${MAX_LIST}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc`,
    { method: "GET" },
    fetchImpl,
  );
  if (!response.ok) return fail(response);
  const body = (await response.json()) as { files?: DriveFileSummary[] };
  const files = Array.isArray(body.files) ? body.files : [];
  return {
    ok: true,
    files,
    detail: files.length
      ? `${files.length} file(s) visible to the office. ${SCOPE_NOTE}`
      : `No files are visible to the office yet. ${SCOPE_NOTE}`,
  };
}

export async function readDriveFileWith(
  settings: DriveSettings,
  fileId: string,
  fetchImpl: typeof fetch,
): Promise<DriveResult> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return { ok: false, detail: "That is not a valid Drive file id. Nothing was read." };
  }
  const meta = await gateway(
    settings,
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime`,
    { method: "GET" },
    fetchImpl,
  );
  if (!meta.ok) return fail(meta);
  const file = (await meta.json()) as DriveFileSummary;
  if (file.mimeType?.startsWith("application/vnd.google-apps.")) {
    return {
      ok: false,
      detail: `"${file.name}" is a Google Docs/Sheets-style file, which this connection cannot export. Nothing was read.`,
    };
  }
  const content = await gateway(
    settings,
    `/files/${encodeURIComponent(fileId)}?alt=media`,
    { method: "GET" },
    fetchImpl,
  );
  if (!content.ok) return fail(content);
  const buffer = await content.arrayBuffer();
  if (buffer.byteLength > MAX_READ_BYTES) {
    return {
      ok: false,
      detail: `"${file.name}" is too large to read safely here (${buffer.byteLength} bytes). Nothing was read.`,
    };
  }
  const text = Buffer.from(buffer).toString("utf8");
  return { ok: true, file, text, detail: `Read "${file.name}" (${buffer.byteLength} bytes).` };
}

export async function createDriveFileWith(
  settings: DriveSettings,
  name: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<DriveResult> {
  const cleanName = name.trim().slice(0, 200);
  if (!cleanName) return { ok: false, detail: "A file name is required. Nothing was created." };
  if (text.length > MAX_WRITE_CHARS) {
    return { ok: false, detail: `Text is too long (max ${MAX_WRITE_CHARS} characters). Nothing was created.` };
  }
  const boundary = "canx-office-drive";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: cleanName, mimeType: "text/plain" }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const response = await gateway(
    settings,
    `/../upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
    fetchImpl,
  );
  if (!response.ok) return fail(response);
  const file = (await response.json()) as DriveFileSummary;
  if (!file?.id) return { ok: false, detail: "Drive did not confirm the new file. Nothing is marked as saved." };
  return { ok: true, file, detail: `Created "${file.name}" in Drive (id ${file.id}). The original request text is unchanged.` };
}

export async function updateDriveFileWith(
  settings: DriveSettings,
  fileId: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<DriveResult> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return { ok: false, detail: "That is not a valid Drive file id. Nothing was changed." };
  }
  if (text.length > MAX_WRITE_CHARS) {
    return { ok: false, detail: `Text is too long (max ${MAX_WRITE_CHARS} characters). Nothing was changed.` };
  }
  const response = await gateway(
    settings,
    `/../upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
    {
      method: "PATCH",
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
      body: text,
    },
    fetchImpl,
  );
  if (!response.ok) return fail(response);
  const file = (await response.json()) as DriveFileSummary;
  if (!file?.id) return { ok: false, detail: "Drive did not confirm the update. Nothing is marked as saved." };
  return { ok: true, file, detail: `Updated "${file.name}" in Drive (id ${file.id}).` };
}
