/**
 * Build receipts on Work Board tasks. A receipt is the JSON object the task
 * executor writes at the START of `evidence`; colleague relays later append
 * plain-text notes after it ("[colleague-relay ...]"), so the receipt is read
 * from the leading object and the appended notes are kept separately.
 * Pure: no network, no storage.
 */
export interface LeadingJson { json: string | null; tail: string }

/** Splits a leading JSON object from any text appended after it. */
export function splitLeadingJson(text: string): LeadingJson {
  const start = text.search(/\S/);
  if (start < 0 || text[start] !== "{") return { json: null, tail: text };
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { json: text.slice(start, i + 1), tail: text.slice(i + 1) };
  }
  return { json: null, tail: text };
}

export interface BuildReceipt { builder: "codex" | "claude"; state: string; runId?: number; attempt?: string }

/** The recorded build attempt on a task, or null when there is none. */
export function readBuildReceipt(evidence: string | null | undefined): BuildReceipt | null {
  const { json } = splitLeadingJson(evidence ?? "");
  if (!json) return null;
  try {
    const x = JSON.parse(json) as Record<string, unknown>;
    if (x["kind"] !== "codex-task-v1" && x["kind"] !== "office-task-v2") return null;
    const builder = x["kind"] === "office-task-v2" && x["builder"] === "claude" ? "claude" : "codex";
    if (x["kind"] === "office-task-v2" && x["builder"] !== "claude" && x["builder"] !== "codex") return null;
    const runId = Number.isSafeInteger(x["runId"]) && (x["runId"] as number) > 0 ? (x["runId"] as number) : undefined;
    return { builder, state: typeof x["state"] === "string" ? x["state"] : "unknown", ...(runId ? { runId } : {}), ...(typeof x["attempt"] === "string" ? { attempt: x["attempt"] } : {}) };
  } catch { return null; }
}
