/** Portable, client-safe Stage 1 contract. Data is evidence, never instructions. */
export type SharedLogKind = "decision" | "task" | "problem" | "observation" | "action";
export interface SharedLogEntry {
  id: string; at: string; actor: "John" | "Elsie" | "Claude" | "ChatGPT";
  kind: SharedLogKind; audience: "office-status"; summary: string; evidence: string;
}
export interface StatusSource {
  name: string; state: "read" | "failed" | "denied"; count: number; truncated: boolean;
}
export interface OfficeStatus {
  version: 1; checkedAt: string; complete: boolean;
  projects: Array<{ id: string; name: string; stage: string; stageBasis: string; updatedAt: string | null }>;
  sharedLog: SharedLogEntry[];
  recentDecisions: SharedLogEntry[];
  openTasks: Array<{ id: string; projectId: string | null; status: string; updatedAt: string | null }>;
  knownProblems: string[];
  tools: Array<{ name: string; state: "read-verified" | "configured-unverified" | "not-configured-here" | "unknown"; detail: string }>;
  sources: StatusSource[];
  privacy: string;
}
/** Reject credential-shaped strings before length truncation can disguise them. */
export function statusText(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  if (/sk-(?:ant-|proj-|[A-Za-z0-9]{20})|gh[pousr]_[A-Za-z0-9]+|github_pat_|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|(?:password|api[_ -]?key|secret|access[_ -]?token)\s*[:=]\s*\S+/i.test(value)) return "[credential-shaped text withheld]";
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}
export function parseSharedLog(raw: string): SharedLogEntry[] | null {
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries)) return null;
    const entries: SharedLogEntry[] = [];
    const ids = new Set<string>();
    for (const e of value.entries) {
      if (e?.audience !== "office-status") continue; // Only intentionally shared operational entries.
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(e.id) || ids.has(e.id) ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(e.at) || !Number.isFinite(Date.parse(e.at)) ||
          !["John", "Elsie", "Claude", "ChatGPT"].includes(e.actor) ||
          !["decision", "task", "problem", "observation", "action"].includes(e.kind) ||
          typeof e.summary !== "string" || !e.summary.trim() || typeof e.evidence !== "string") return null;
      ids.add(e.id);
      entries.push({ id: e.id, at: e.at, actor: e.actor, kind: e.kind, audience: "office-status", summary: statusText(e.summary, 1200), evidence: statusText(e.evidence, 300) });
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  } catch { return null; }
}
