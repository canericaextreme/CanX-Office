/**
 * Google Drive through the linked "canerica's Google Drive" connection.
 *
 * Granted scope is drive.file only: the office can see and edit files it
 * created itself (or files explicitly opened to it). It cannot browse or
 * search John's existing Drive, and list results are labelled accordingly.
 * No delete operation exists here by design.
 *
 * Routes (Drive API v3 via the connector gateway):
 *   metadata/content/export  {BASE}/drive/v3/files...
 *   uploads (create/update)  {BASE}/upload/drive/v3/files...
 */

export const DRIVE_GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const TIMEOUT_MS = 20_000;
const MAX_READ_BYTES = 200_000;
const MAX_META_BYTES = 64_000;
const MAX_LIST_BYTES = 256_000;
const MAX_WRITE_CHARS = 100_000;
const MAX_LIST = 50;
const FILE_FIELDS = "id,name,mimeType,modifiedTime,webViewLink";

/** Text formats this implementation reads as-is. */
const TEXT_MIME = /^(text\/[a-z0-9.+-]+|application\/(json|xml|csv|x-yaml|yaml|markdown))$/i;
/** Google-native types this implementation exports, per Drive files.export. */
const EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

export function driveApiUrl(path: string): string {
  return `${DRIVE_GATEWAY_BASE}/drive/v3${path}`;
}
export function driveUploadUrl(path: string): string {
  return `${DRIVE_GATEWAY_BASE}/upload/drive/v3${path}`;
}

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
  webViewLink?: string;
}

export type DriveResult =
  | { ok: true; files?: DriveFileSummary[]; file?: DriveFileSummary; text?: string; verified?: boolean; detail: string }
  | { ok: false; detail: string; providerStatus?: number; uncertain?: boolean };

const SCOPE_NOTE =
  "Permission is selected-files only: this lists files the office created or that were explicitly shared to it, not your whole Drive.";

type Fetched =
  | { kind: "ok"; status: number; bytes: Uint8Array }
  | { kind: "http"; status: number }
  | { kind: "too_large"; status: number }
  | { kind: "network" };

/** One request; the timeout covers the body read; the body is capped while streaming. */
async function request(
  settings: DriveSettings,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  maxBytes: number,
): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${settings.lovableApiKey}`,
        "X-Connection-Api-Key": settings.connectionApiKey,
      },
    });
    if (!response.ok) {
      // Provider bodies may contain file names or account details: never log them.
      void response.body?.cancel().catch(() => undefined);
      console.error(`Drive gateway request failed [${response.status}]`);
      return { kind: "http", status: response.status };
    }
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      void response.body?.cancel().catch(() => undefined);
      return { kind: "too_large", status: response.status };
    }
    if (!response.body) return { kind: "ok", status: response.status, bytes: new Uint8Array() };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large", status: response.status };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { kind: "ok", status: response.status, bytes };
  } catch {
    console.error("Drive gateway request did not complete (network error or timeout)");
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseJson(bytes: Uint8Array): unknown {
  const text = decode(bytes);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asFile(value: unknown): DriveFileSummary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v["id"] !== "string" || !v["id"] || typeof v["name"] !== "string" || typeof v["mimeType"] !== "string") return null;
  const file: DriveFileSummary = { id: v["id"], name: v["name"], mimeType: v["mimeType"] };
  if (typeof v["modifiedTime"] === "string") file.modifiedTime = v["modifiedTime"];
  if (typeof v["webViewLink"] === "string" && /^https:\/\//.test(v["webViewLink"])) file.webViewLink = v["webViewLink"];
  return file;
}

const VALID_ID = /^[A-Za-z0-9_-]{10,200}$/;

function readFailure(f: Exclude<Fetched, { kind: "ok" }>, what: string): DriveResult {
  if (f.kind === "http") return { ok: false, providerStatus: f.status, detail: `Google Drive refused the request (status ${f.status}). ${what}` };
  if (f.kind === "too_large") return { ok: false, detail: `Drive returned more data than this office reads safely. ${what}` };
  return { ok: false, detail: `Google Drive did not respond in time. ${what}` };
}

/** Write failures: only a definite 4xx proves nothing changed. */
function writeFailure(f: Exclude<Fetched, { kind: "ok" }>, action: string): DriveResult {
  if (f.kind === "http" && f.status >= 400 && f.status < 500) {
    return { ok: false, providerStatus: f.status, detail: `Google Drive refused the ${action} (status ${f.status}). Nothing was changed.` };
  }
  return {
    ok: false,
    uncertain: true,
    providerStatus: f.kind === "http" ? f.status : undefined,
    detail: `The ${action} outcome is uncertain: Google Drive ${f.kind === "http" ? `returned status ${f.status}` : f.kind === "too_large" ? "sent an unexpected reply" : "did not respond in time"}. Check Drive before trying again; it was not retried automatically.`,
  };
}

function linkText(file: DriveFileSummary): string {
  return file.webViewLink ? ` Open it: ${file.webViewLink}` : "";
}

async function fetchMeta(settings: DriveSettings, fileId: string, fetchImpl: typeof fetch): Promise<DriveFileSummary | DriveResult> {
  const meta = await request(settings, driveApiUrl(`/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`), { method: "GET" }, fetchImpl, MAX_META_BYTES);
  if (meta.kind !== "ok") return readFailure(meta, "Nothing was read or changed.");
  const file = asFile(parseJson(meta.bytes));
  if (!file || file.id !== fileId) return { ok: false, detail: "Drive sent an unreadable file description. Nothing was read or changed." };
  return file;
}

function isResult(value: DriveFileSummary | DriveResult): value is DriveResult {
  return "ok" in value;
}

export async function listDriveFilesWith(settings: DriveSettings, fetchImpl: typeof fetch): Promise<DriveResult> {
  const response = await request(
    settings,
    driveApiUrl(`/files?pageSize=${MAX_LIST}&fields=${encodeURIComponent(`files(${FILE_FIELDS})`)}&orderBy=${encodeURIComponent("modifiedTime desc")}`),
    { method: "GET" },
    fetchImpl,
    MAX_LIST_BYTES,
  );
  if (response.kind !== "ok") return readFailure(response, "No files were listed.");
  const body = parseJson(response.bytes) as { files?: unknown } | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.files)) {
    return { ok: false, detail: "Drive sent an unreadable file list. No files were listed." };
  }
  const files = body.files.map(asFile).filter((f): f is DriveFileSummary => f !== null).slice(0, MAX_LIST);
  const skipped = body.files.length - files.length;
  return {
    ok: true,
    files,
    detail:
      (files.length ? `${files.length} file(s) visible to the office. ${SCOPE_NOTE}` : `No files are visible to the office yet. ${SCOPE_NOTE}`) +
      (skipped > 0 ? ` ${skipped} entr${skipped === 1 ? "y was" : "ies were"} unreadable and left out.` : ""),
  };
}

export async function readDriveFileWith(settings: DriveSettings, fileId: string, fetchImpl: typeof fetch): Promise<DriveResult> {
  if (!VALID_ID.test(fileId)) return { ok: false, detail: "That is not a valid Drive file id. Nothing was read." };
  const meta = await fetchMeta(settings, fileId, fetchImpl);
  if (isResult(meta)) return meta;
  const file = meta;
  const exportType = EXPORTS[file.mimeType];
  let url: string;
  if (exportType) {
    url = driveApiUrl(`/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportType)}`);
  } else if (TEXT_MIME.test(file.mimeType)) {
    url = driveApiUrl(`/files/${encodeURIComponent(fileId)}?alt=media`);
  } else {
    return {
      ok: false,
      detail: `"${file.name}" is a ${file.mimeType} file. This office implementation currently reads only plain-text files, Google Docs (as text) and Google Sheets (as CSV). Nothing was read.`,
    };
  }
  const content = await request(settings, url, { method: "GET" }, fetchImpl, MAX_READ_BYTES);
  if (content.kind === "too_large") return { ok: false, detail: `"${file.name}" is larger than ${MAX_READ_BYTES} bytes, the safe reading limit. Nothing was read.` };
  if (content.kind !== "ok") return readFailure(content, "Nothing was read.");
  const text = decode(content.bytes);
  if (text === null) return { ok: false, detail: `"${file.name}" is not valid text. Nothing was read.` };
  return {
    ok: true,
    file,
    text,
    detail: `Read "${file.name}" (${content.bytes.byteLength} bytes${exportType ? `, exported as ${exportType}` : ""}).`,
  };
}

async function readBack(settings: DriveSettings, fileId: string, expected: string, fetchImpl: typeof fetch): Promise<boolean | null> {
  const content = await request(settings, driveApiUrl(`/files/${encodeURIComponent(fileId)}?alt=media`), { method: "GET" }, fetchImpl, MAX_WRITE_CHARS * 4 + 1024);
  if (content.kind !== "ok") return null;
  const text = decode(content.bytes);
  return text === expected;
}

function verificationNote(verified: boolean | null): string {
  if (verified === true) return " Saved content confirmed by reading it back.";
  if (verified === false) return " Warning: reading it back did not match the text sent — check the file in Drive.";
  return " The read-back check could not run, so the saved content is not yet confirmed.";
}

export async function createDriveFileWith(settings: DriveSettings, name: string, text: string, fetchImpl: typeof fetch): Promise<DriveResult> {
  const cleanName = name.trim().slice(0, 200);
  if (!cleanName) return { ok: false, detail: "A file name is required. Nothing was created." };
  if (text.length > MAX_WRITE_CHARS) return { ok: false, detail: `Text is too long (max ${MAX_WRITE_CHARS} characters). Nothing was created.` };
  const boundary = `canx-office-drive-${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: cleanName, mimeType: "text/plain" }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const response = await request(
    settings,
    driveUploadUrl(`/files?uploadType=multipart&fields=${FILE_FIELDS}`),
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    fetchImpl,
    MAX_META_BYTES,
  );
  if (response.kind !== "ok") return writeFailure(response, "file creation");
  const file = asFile(parseJson(response.bytes));
  if (!file) {
    return { ok: false, uncertain: true, detail: "Drive accepted the request but its reply was unreadable, so whether the file was created is uncertain. Check Drive before trying again." };
  }
  const verified = await readBack(settings, file.id, text, fetchImpl);
  return {
    ok: true,
    file,
    verified: verified === true,
    detail: `Created "${file.name}" in Drive (id ${file.id}).${linkText(file)}${verificationNote(verified)}`,
  };
}

export async function updateDriveFileWith(
  settings: DriveSettings,
  fileId: string,
  text: string,
  fetchImpl: typeof fetch,
  expectedName?: string,
): Promise<DriveResult> {
  if (!VALID_ID.test(fileId)) return { ok: false, detail: "That is not a valid Drive file id. Nothing was changed." };
  if (text.length > MAX_WRITE_CHARS) return { ok: false, detail: `Text is too long (max ${MAX_WRITE_CHARS} characters). Nothing was changed.` };
  const meta = await fetchMeta(settings, fileId, fetchImpl);
  if (isResult(meta)) return meta.ok ? meta : { ...meta, detail: meta.detail.replace("Nothing was read or changed.", "Nothing was changed.") };
  if (expectedName !== undefined && meta.name !== expectedName.trim()) {
    return { ok: false, detail: `File ${fileId} is named "${meta.name}", not "${expectedName.trim()}". Nothing was changed.` };
  }
  if (meta.mimeType !== "text/plain") {
    return {
      ok: false,
      detail: `"${meta.name}" is a ${meta.mimeType} file. Only plain-text files can be replaced here, so PDFs, Word files, Google Docs and other formats are never overwritten. Nothing was changed.`,
    };
  }
  const response = await request(
    settings,
    driveUploadUrl(`/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`),
    { method: "PATCH", headers: { "Content-Type": "text/plain; charset=UTF-8" }, body: text },
    fetchImpl,
    MAX_META_BYTES,
  );
  if (response.kind !== "ok") return writeFailure(response, "update");
  const file = asFile(parseJson(response.bytes));
  if (!file || file.id !== fileId) {
    return { ok: false, uncertain: true, detail: "Drive accepted the update but its reply was unreadable, so whether the text changed is uncertain. Check Drive before trying again." };
  }
  const verified = await readBack(settings, fileId, text, fetchImpl);
  return {
    ok: true,
    file,
    verified: verified === true,
    detail: `Updated "${file.name}" in Drive (id ${file.id}).${linkText(file)}${verificationNote(verified)}`,
  };
}
