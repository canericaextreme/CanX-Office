import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/finance")({
  head: () => ({
    meta: [
      { title: "CanX Office — Finance Office" },
      { name: "description", content: "Money, receipts, and records in CanX Office." },
      { property: "og:title", content: "CanX Office — Finance Office" },
      { property: "og:description", content: "Money, receipts, and records in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Finance,
});

function Finance() {
  return (
    <RoomShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Income", value: "Unknown", note: "No accounts connected" },
          { label: "Expenses", value: "Unknown", note: "No accounts connected" },
          { label: "Receipts", value: "0", note: "Mailbox not linked" },
          { label: "Tax prep", value: "Not started", note: "Professional review needed" },
        ].map((m) => (
          <Card key={m.label} className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{m.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{m.value}</div>
              <p className="text-xs text-muted-foreground">{m.note}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="border-border bg-card sm:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gross receipts, fees, refunds, net receipts, and payout reconciliation will be tracked
              distinctly once Stripe or other payment sources are connected. No live data in Phase
              1.
            </p>
            <Button className="mt-4" disabled>
              Connect Stripe (Phase 4+)
            </Button>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
