/**
 * Deterministic gate for Drive writes: the model may only create/update a
 * Drive file when John's CURRENT request explicitly asks for a Drive save,
 * create or update. Provider-proposed writes from unrelated requests are
 * blocked. Discussion/negation filtering stays with requestIsDiscussionOnly.
 */

const WRITE_VERB = /\b(save|saving|create|make|write|put|store|upload|update|replace|overwrite|edit|change|add)\b/i;
const DRIVE_WORD = /\b(google\s+drive|drive|gdrive)\b/i;

export function requestExplicitlyAsksDriveWrite(request: string): boolean {
  const text = String(request ?? "");
  return WRITE_VERB.test(text) && DRIVE_WORD.test(text);
}

/** An update must name the exact file (its id, or its exact name) in the current request. */
export function requestNamesDriveFile(request: string, fileId: string, fileName: string): boolean {
  const text = String(request ?? "").toLowerCase();
  const id = fileId.trim();
  const name = fileName.trim().toLowerCase();
  return (id.length >= 10 && text.includes(id.toLowerCase())) || (name.length >= 3 && text.includes(name));
}
