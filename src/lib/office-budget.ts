/**
 * CanX Office — running-cost ceiling record.
 *
 * This is a written-down decision by John, not an enforced limit. The ceiling
 * is deliberately NOT converted into a machine spending limit for any
 * provider, because the amount is a total monthly office running cost, not a
 * per-provider allowance and not a target to spend. Actual provider billing is
 * not read live here, so every unknown cost stays "not verified".
 */

export interface CostLine {
  id: string;
  label: string;
  /** Monthly amount in the working currency, or null when the cost is not known yet. */
  monthly: number | null;
  note: string;
}

export const RUNNING_COST_CEILING = 500;

/** Confirmed by John. The ceiling is recorded in Canadian dollars. */
export const RUNNING_COST_CURRENCY = "CAD";
export const RUNNING_COST_CURRENCY_IS_ASSUMED = false;

export const RUNNING_COST_APPROVED_ON = "2026-09-09";

export const RUNNING_COST_SCOPE = [
  "Total for all office running costs added together each month.",
  "Not $500 for each provider, and not an amount to be spent.",
  "Lovable build credits are separate and are not counted against this ceiling.",
  "Actual provider billing is not read here, so amounts stay unknown until they are verified separately.",
].join(" ");

/**
 * Known and unknown monthly running costs. A cost is only shown once a real
 * invoice or price is recorded — no estimates are invented here, and an
 * unknown cost is never reported as zero.
 */
export const RUNNING_COST_LINES: CostLine[] = [
  {
    id: "database",
    label: "CanX-owned database and sign-in (Supabase)",
    monthly: null,
    note: "Cost not verified here. Check the Supabase account for the current plan and charges.",
  },
  {
    id: "ai",
    label: "CanX-owned AI (OpenAI)",
    monthly: null,
    note: "Cost not verified here. Provider billing is not read by the office.",
  },
  {
    id: "hosting",
    label: "Hosting and domain",
    monthly: null,
    note: "Cost not verified here. Any Lovable plan or domain charge is not recorded in this office.",
  },
  {
    id: "review",
    label: "Independent review (Claude)",
    monthly: null,
    note: "Cost not verified here. Anthropic billing has not been checked.",
  },
];

export interface BudgetView {
  ceiling: number;
  currency: string;
  currencyAssumed: boolean;
  approvedOn: string;
  known: CostLine[];
  unknown: CostLine[];
  /** Sum of known monthly costs, or null when nothing is known. */
  knownTotal: number | null;
  /**
   * Money left for AI and other services after known costs.
   * Deliberately null while any cost is unknown — an allocation is only shown
   * when the actual costs are known.
   */
  availableForApis: number | null;
  enforcement: "unverified";
  enforcementNote: string;
}

export function budgetView(lines: CostLine[] = RUNNING_COST_LINES): BudgetView {
  const known = lines.filter((line) => typeof line.monthly === "number");
  const unknown = lines.filter((line) => line.monthly === null);
  const knownTotal = known.length ? known.reduce((sum, line) => sum + (line.monthly ?? 0), 0) : null;

  return {
    ceiling: RUNNING_COST_CEILING,
    currency: RUNNING_COST_CURRENCY,
    currencyAssumed: RUNNING_COST_CURRENCY_IS_ASSUMED,
    approvedOn: RUNNING_COST_APPROVED_ON,
    known,
    unknown,
    knownTotal,
    // Only show an allocation once every cost is actually known.
    availableForApis: unknown.length === 0 && knownTotal !== null ? RUNNING_COST_CEILING - knownTotal : null,
    enforcement: "unverified",
    enforcementNote:
      "Not verified. This ceiling is a recorded decision; the office does not read provider billing and cannot prove a limit is enforced.",
  };
}

export function formatMoney(amount: number, currency = RUNNING_COST_CURRENCY) {
  return `$${amount.toFixed(2)} ${currency}`;
}
