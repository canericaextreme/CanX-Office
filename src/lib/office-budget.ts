/**
 * CanX Office — running-cost ceiling record.
 *
 * This is a written-down decision by John, not an enforced limit. Nothing in
 * the office can charge anything today: no subscription, no provider key and
 * no payment method is configured. The ceiling is deliberately NOT converted
 * into a machine spending limit for any provider, because the amount is a
 * total monthly office running cost, not a per-provider allowance and not a
 * target to spend.
 */

export interface CostLine {
  id: string;
  label: string;
  /** Monthly amount in the working currency, or null when the cost is not known yet. */
  monthly: number | null;
  note: string;
}

export const RUNNING_COST_CEILING = 500;

/** Working assumption only. John has not confirmed the currency; ask before relying on it. */
export const RUNNING_COST_CURRENCY = "CAD";
export const RUNNING_COST_CURRENCY_IS_ASSUMED = true;

export const RUNNING_COST_APPROVED_ON = "2026-09-09";

export const RUNNING_COST_SCOPE = [
  "Total for all office running costs added together each month, if any are ever needed.",
  "Not $500 for each provider, and not an amount to be spent.",
  "Lovable build credits are separate and are not counted against this ceiling.",
  "Nothing is charging anything today. No subscription, key or payment method is set up.",
].join(" ");

/**
 * Known and unknown monthly running costs. Everything is unknown until a real
 * account, invoice or price is recorded — no estimates are invented here.
 */
export const RUNNING_COST_LINES: CostLine[] = [
  {
    id: "database",
    label: "CanX-owned database and sign-in (Supabase)",
    monthly: null,
    note: "No account exists yet, so no price is known.",
  },
  {
    id: "ai",
    label: "CanX-owned AI (OpenAI)",
    monthly: null,
    note: "No key, no plan and no usage. Cost cannot be known before real usage exists.",
  },
  {
    id: "hosting",
    label: "Hosting and domain",
    monthly: null,
    note: "Nothing published from this office. Any existing Lovable plan is not recorded here yet.",
  },
  {
    id: "review",
    label: "Independent review (Claude)",
    monthly: null,
    note: "Planned only. Not connected.",
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
      "Not enforced yet. A spending limit can only be applied and checked once the CanX-owned database and provider account exist.",
  };
}

export function formatMoney(amount: number, currency = RUNNING_COST_CURRENCY) {
  return `$${amount.toFixed(2)} ${currency}`;
}
