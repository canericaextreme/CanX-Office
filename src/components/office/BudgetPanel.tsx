import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { budgetView, formatMoney, RUNNING_COST_SCOPE } from "@/lib/office-budget";

/** Shows John's approved monthly running-cost ceiling with honest known/unknown costs. */
export function BudgetPanel() {
  const view = budgetView();

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Monthly running-cost ceiling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-2xl font-semibold text-foreground">{formatMoney(view.ceiling)}</div>
          <p className="text-xs text-muted-foreground">
            Approved by John on {view.approvedOn}.
            {view.currencyAssumed
              ? ` Currency shown as ${view.currency} as a working assumption — please correct it if that is wrong.`
              : ""}
          </p>
        </div>

        <p className="text-muted-foreground">{RUNNING_COST_SCOPE}</p>

        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Known monthly costs</div>
          {view.known.length === 0 ? (
            <p className="text-muted-foreground">No verified monthly costs are recorded here. Actual charges are unknown.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {view.known.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span>{line.label}</span>
                  <span className="font-medium">{formatMoney(line.monthly ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Costs not known yet</div>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {view.unknown.map((line) => (
              <li key={line.id}>
                <span className="text-foreground">{line.label}</span> — {line.note}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground">
          {view.availableForApis === null
            ? "Money available for AI and other services is not shown, because some running costs are still unknown. It will appear once every cost above is a real, recorded amount."
            : `Available for AI and other services: ${formatMoney(view.availableForApis)} per month.`}
        </p>

        <p className="rounded-md border border-border bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Status: not enforced. {view.enforcementNote} This ceiling is a written decision only — it has not been turned
          into a provider spending limit, and no subscription, key or payment method was set up by recording it.
        </p>
      </CardContent>
    </Card>
  );
}
