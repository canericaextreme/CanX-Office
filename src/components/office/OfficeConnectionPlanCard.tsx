import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readOfficeConnectionPlan } from "@/lib/office-connection-plan";

export function OfficeConnectionPlanCard() {
  const plan = readOfficeConnectionPlan();
  return <Card>
    <CardHeader><CardTitle>{plan.title}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm"><strong>Next step:</strong> {plan.nextStep}</p>
      <p className="text-xs text-muted-foreground">Reviewed {plan.reviewedAt.slice(0, 10)}. {plan.source}.</p>
      <ol className="space-y-3">
        {plan.steps.map(step => <li key={step.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-sm">{step.label}</span>
            <span className="text-xs font-semibold">{step.status === "verified" ? "Verified step" : step.status === "blocked" ? "Blocked" : "Not verified yet"}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{step.evidence}</p>
        </li>)}
      </ol>
    </CardContent>
  </Card>;
}
