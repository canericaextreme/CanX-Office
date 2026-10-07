import type { WorkbenchDeps } from "./manager-work.functions";
import { requestIsDiscussionOnly } from "./builder-choice";
import { sha256Hex } from "./sha256";

const SOURCE = "CanX Brain: conversation summary";

/** Append only, as the verified owner; never replaces a saved Brain record. */
export async function saveManagerBrainWith(
  deps: Pick<WorkbenchDeps, "verifyOwner" | "rest">,
  input: {
    accessToken: string;
    currentRequest: string;
    title: string;
    content: string;
  },
) {
  const fail = (detail: string) => ({ ok: false as const, detail });
  if (
    requestIsDiscussionOnly(input.currentRequest) ||
    !/\b(?:save|file|store|record)\b[\s\S]*\bbrain\b/i.test(input.currentRequest)
  ) {
    return fail("Nothing saved: John must explicitly request saving this note to CanX Brain.");
  }
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || title.length > 200 || !content || content.length > 4000)
    return fail(
      "Brain note requires a title up to 200 characters and content up to 4000 characters.",
    );
  const owner = await deps.verifyOwner(input.accessToken);
  if (!owner.ok) return fail(owner.message);
  const id = `brain-note-${sha256Hex(JSON.stringify([owner.userId, title, content]))}`;
  const path = `office_notes?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(owner.userId)}&select=id,title,detail,source&limit=1`;
  type Note = { id: string; title: string; detail: string; source: string };
  const matches = (row: Note | undefined) =>
    row?.id === id && row.title === title && row.detail === content && row.source === SOURCE;
  try {
    const existing = await deps.rest<Note[]>(input.accessToken, "GET", path);
    if (!existing.ok || !Array.isArray(existing.data))
      return fail("Brain could not be checked before saving. Nothing was written.");
    if (existing.data.length && !matches(existing.data[0]))
      return fail("An existing record conflicts with this Brain note. Nothing was replaced.");
    if (!existing.data.length) {
      const saved = await deps.rest(input.accessToken, "POST", "office_notes", {
        id,
        owner_id: owner.userId,
        kind: "decision",
        title,
        detail: content,
        owner_name: "",
        provenance: "ai-proposal",
        source: SOURCE,
      });
      // Even an uncertain/duplicate POST is resolved by exact owner-scoped readback.
      if (!saved.ok) {
        const check = await deps.rest<Note[]>(input.accessToken, "GET", path);
        if (!check.ok || !Array.isArray(check.data) || !matches(check.data[0]))
          return fail("Brain save was not confirmed. Do not claim it was saved.");
      }
    }
    const readback = await deps.rest<Note[]>(input.accessToken, "GET", path);
    if (!readback.ok || !Array.isArray(readback.data) || !matches(readback.data[0]))
      return fail("Brain save was not confirmed by exact readback.");
    return {
      ok: true as const,
      id,
      title,
      content,
      detail: `CanX Brain note saved and read back (${id}).\nTitle: ${title}\nContent: ${content}`,
    };
  } catch {
    return fail("Brain save or readback failed. No confirmed save can be reported.");
  }
}
