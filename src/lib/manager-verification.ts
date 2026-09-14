/**
 * Office Manager — visible verification receipt and budget scopes.
 *
 * Pure helpers, no provider calls and no storage. The receipt is built from
 * the server-read office context that was actually used for the answer, so it
 * can never claim a source that was not read. Rooms that failed to read, or
 * that live only on John's device, are reported as gaps rather than filled in.
 */

export interface VerificationReceipt {
  /** Labelled sources actually present in the context used for this answer. */
  sources: string[];
  /** ISO time the context was read. */
  checkedAt: string;
  /** Reads that failed, or records that are device-only / not visible. */
  gaps: string[];
  provider: string;
  /** Exact configured model. Never described as "latest". */
  model: string;
}

const MAX_SOURCES = 14;
const MAX_GAPS = 10;

const SOURCE_LINE = /^(.{3,120}?)\s\[provenance:\s([^\]]{1,80})\]/;
const UNREADABLE = /could not be read just now/i;
const DEVICE_ONLY = /stored on John's own device|on John's device|device-only/i;

/**
 * Reads the exact context text that was sent with the answer and reports what
 * it contained. Nothing is inferred: a source appears only when its labelled
 * line is present.
 */
export function buildVerificationReceipt(
  contextText: string,
  options: { provider: string; model: string; checkedAt: string; extraSources?: string[]; extraGaps?: string[] },
): VerificationReceipt {
  const sources: string[] = [];
  const gaps: string[] = [];
  const seenSource = new Set<string>();
  const seenGap = new Set<string>();

  for (const raw of contextText.split("\n")) {
    const lineText = raw.trim();
    if (!lineText) continue;
    const match = SOURCE_LINE.exec(lineText);
    if (match) {
      const label = match[1]!.replace(/^[-•]\s*/, "").trim();
      const provenance = match[2]!.trim();
      const entry = `${label} — ${provenance}`;
      if (!seenSource.has(entry) && sources.length < MAX_SOURCES) {
        seenSource.add(entry);
        sources.push(entry);
      }
      if (UNREADABLE.test(lineText) && !seenGap.has(label) && gaps.length < MAX_GAPS) {
        seenGap.add(label);
        gaps.push(`${label}: could not be read this time, so nothing is reported for it.`);
      }
      continue;
    }
    if (DEVICE_ONLY.test(lineText) && gaps.length < MAX_GAPS) {
      const short = lineText.slice(0, 160);
      if (!seenGap.has(short)) {
        seenGap.add(short);
        gaps.push(short);
      }
    }
  }

  for (const extra of options.extraSources ?? []) {
    if (!seenSource.has(extra) && sources.length < MAX_SOURCES) {
      seenSource.add(extra);
      sources.push(extra);
    }
  }
  for (const extra of options.extraGaps ?? []) {
    if (!seenGap.has(extra) && gaps.length < MAX_GAPS) {
      seenGap.add(extra);
      gaps.push(extra);
    }
  }

  return {
    sources,
    checkedAt: options.checkedAt,
    gaps,
    provider: options.provider,
    model: options.model,
  };
}

/* --------------------------------- budgets -------------------------------- */

/** John's recorded office-wide running-cost ceiling (9 September 2026). */
export const OFFICE_CEILING_CENTS = 50_000;
/** The Office Manager's own AI sub-limit inside that ceiling. */
export const MANAGER_AI_SUBLIMIT_CENTS = 10_000;

export interface BudgetScopeLine {
  id: "office-ceiling" | "manager-ai";
  label: string;
  amount: string;
  scope: string;
  /** Plain statement of whether the limit is actually enforced in this app. */
  enforcement: string;
}

export function cad(cents: number): string {
  return `C$${(cents / 100).toFixed(2)}`;
}

/**
 * Two separately scoped values. They are never added together and neither is
 * ever described as current spend.
 */
export function budgetScopeLines(managerEnforced: boolean): BudgetScopeLine[] {
  return [
    {
      id: "office-ceiling",
      label: "Office running-cost ceiling",
      amount: `${cad(OFFICE_CEILING_CENTS)}/month`,
      scope: "All CanX Office running costs together, across every provider and subscription.",
      enforcement:
        "Recorded owner policy (John, 9 September 2026). No office-wide live cost reader exists here, so this is not automatically enforced and no spend total is shown.",
    },
    {
      id: "manager-ai",
      label: "Office Manager AI sub-limit",
      amount: `${cad(MANAGER_AI_SUBLIMIT_CENTS)}/month`,
      scope: "Office Manager AI calls only. This sits inside the office ceiling above; the two are not added together.",
      enforcement: managerEnforced
        ? "Enforced by the Manager's own durable spending record: every call reserves before it runs and settles afterwards."
        : "Not readable right now, so enforcement cannot be confirmed from here. Nothing about current spend is claimed.",
    },
  ];
}

/** Model status wording. Configuration alone never proves a model is newest. */
export function modelStatusLine(model: string | null, lastCheckedAt: string | null): string {
  if (!model) return "Configured model: none configured on the server.";
  return [
    `Configured model: ${model}`,
    lastCheckedAt
      ? `Last connection check: ${lastCheckedAt}`
      : "Last connection check: no successful live check recorded in this session.",
  ].join(" · ");
}
